// Package creator — API créateur (migration depuis Hono apps/api).
// catégories, analytics/stats (proxy Umami), users (me/:username/follow).
package creator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/shared/identifier"
	"github.com/qoefi/api/internal/slug"
	"github.com/qoefi/api/internal/supastorage"
	"github.com/qoefi/api/internal/umami"
	"github.com/redis/go-redis/v9"
)

type Handler struct {
	pool       pooler
	q          ServiceQuerier
	umami      *umami.Client
	defaultWeb string
	// Upload d'images (injecté via WithMediaUpload) — nil = 503 explicite.
	mediaStorage *supastorage.Client
	mediaAssets  *mediaassets.Service
	// mediaCDNBase réécrit les URLs storage vers le CDN public.
	mediaCDNBase string
	// asynq enfile les confirmations double opt-in (nil = envoi désactivé,
	// l'inscription reste enregistrée en attente).
	asynq *asynq.Client
	// subRC/window/max : rate-limit Redis de l'inscription publique (fiche 01
	// §5 — la confirmation n'empêche pas à elle seule le harcèlement par
	// e-mails de confirmation). nil = pas de limite (tests).
	subRC     *redis.Client
	subWindow time.Duration
	subMax    int
}

// SetAsynqClient branche le client asynq (envoi des confirmations).
func (h *Handler) SetAsynqClient(c *asynq.Client) { h.asynq = c }

// SetPublicSubscribeRateLimit branche le rate-limit de POST
// /v1/publications/{slugOrId}/subscribe (fenêtre, max). Même pattern que
// home.SetSubscribeRateLimit.
func (h *Handler) SetPublicSubscribeRateLimit(rc *redis.Client, window time.Duration, max int) {
	h.subRC, h.subWindow, h.subMax = rc, window, max
}

// publicSubscribeLimiter enveloppe l'inscription publique du limiteur branché
// (no-op sinon, comme home.subscribeLimiter).
func (h *Handler) publicSubscribeLimiter(next http.HandlerFunc) http.Handler {
	if h.subRC == nil {
		return next
	}
	return middleware.RateLimit("creator-public-subscribe", h.subRC, h.subWindow, h.subMax, false)(next)
}

func NewHandler(pool *pgxpool.Pool, umamiCli *umami.Client, defaultWebsiteID string) *Handler {
	return &Handler{pool: pool, q: db.New(pool), umami: umamiCli, defaultWeb: defaultWebsiteID}
}

// RegisterAPIKey — routes créateur authentifiées par clé API (qoe_live_…).
// ⚠️ /v1/categories N'EST PAS déclaré ici : il est enregistré une seule fois
// dans RegisterProtected (CombinedAuth accepte JWT ET clés API) pour éviter
// le double enregistrement du même chemin (le groupe clé API masquerait la
// route JWT → 401 sur le dashboard).
func (h *Handler) RegisterAPIKey(r chi.Router) {
	r.With(middleware.RequireAPIScope(middleware.ScopeAnalytics)).Get("/v1/analytics/stats", h.analyticsStats)
	// Contenu pour front personnalisé : profil, liste et détail d'articles
	// (HTML), surlignages publics filtrables par article. Scope READ.
	r.Get("/v1/creator/me", h.apiMe)
	r.Get("/v1/creator/articles", h.apiArticles)
	r.Get("/v1/creator/articles/{slug}", h.apiArticleBySlug)
	r.Get("/v1/creator/categories", h.apiCategories)
	r.Get("/v1/creator/search", h.apiSearch)
	// Écriture CMS (scope WRITE) : créer / éditer / supprimer ses articles
	// depuis des outils externes.
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Post("/v1/creator/articles", h.apiArticleCreate)
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Patch("/v1/creator/articles/{id}", h.apiArticleUpdate)
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Patch("/v1/creator/articles/{id}/slug", h.apiArticleSlugSet)
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Delete("/v1/creator/articles/{id}", h.apiArticleDelete)
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/highlights", h.apiHighlights)
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/highlights/{id}/comments", h.apiHighlightComments)
	// Export groupé : l'article ET ses annotations ancrées dans le document
	// canonique inclus (même payload) — le front du créateur peint les marques
	// avec son propre code, zéro re-fetch, zéro recherche.
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/articles/{slug}/annotations", h.apiArticleAnnotations)
	// Upload d'images (couvertures, corps) — scope WRITE.
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Post("/v1/creator/media", h.apiMediaUpload)
	// Abonnés et audience de la publication (scope READ pour listing/stats, WRITE pour ajout/suppression)
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/subscribers", h.apiSubscribersList)
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/subscribers/stats", h.apiSubscribersStats)
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Post("/v1/creator/subscribers", h.apiSubscriberCreate)
	r.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Delete("/v1/creator/subscribers/{idOrEmail}", h.apiSubscriberDelete)
	// Métadonnées complètes de branding de la publication pour front headless
	r.With(middleware.RequireAPIScope(middleware.ScopeRead)).Get("/v1/creator/publisher", h.apiPublisherMetadata)
	// ⚠️ /v1/creator/recommendations N'EST PAS déclaré ici : il vit dans
	// RegisterProtected (CombinedAuth JWT + clés API). Un double enregistrement
	// ferait masquer la route JWT par le groupe clé API → 401 sur le dashboard.
}

// apiHighlights — GET /v1/creator/highlights : surlignages publics des
// lecteurs sur les articles liés au créateur (multi-auteurs inclus),
// paginés. Réservé aux clés API (scope READ).
func (h *Handler) apiHighlights(w http.ResponseWriter, r *http.Request) {
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())
	if userID == "" && publisherID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	limit, offset := parseLimitCursor(r)
	officialOnly := r.URL.Query().Get("official") == "true"
	page, err := h.apiHighlightsPage(
		r.Context(),
		publisherID,
		userID,
		r.URL.Query().Get("article"),
		officialOnly,
		limit,
		offset,
	)
	if err != nil {
		log.Printf("[creator] api highlights: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, page)
}

// RegisterPublic — routes publiques (auth optionnelle : le viewer connecté
// voit `isFollowing` / `viewerFollows` renseignés, sinon false).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/users/{username}", h.userByUsername)
	r.Get("/v1/users/{username}/followers", h.userFollowers)
	r.Get("/v1/users/{username}/following", h.userFollowing)
	// Inscription publique à la newsletter d'une publication (CORS activé pour intégration externe).
	// Rate-limitée : la confirmation n'empêche pas à elle seule le harcèlement
	// par e-mails de confirmation (fiche 01 §5).
	r.Options("/v1/publishers/{slugOrId}/subscribe", h.publicSubscribeOptions)
	r.Post("/v1/publishers/{slugOrId}/subscribe", h.publicSubscribeLimiter(h.publicSubscribe).ServeHTTP)
	// Profil public minimal (nom + logo, rien de sensible) : le site tiers et
	// la page qoe.fi affichent « Confirmer l'abonnement à [éditeur] »
	// sans clé API. Lecture seule indexée, pas de PII.
	r.Get("/v1/publishers/{slugOrId}/profile", h.publicPublisherProfile)

	// Alias de rétrocompatibilité pour d'anciens formulaires embeds externes.
	r.Options("/v1/publications/{slugOrId}/subscribe", h.publicSubscribeOptions)
	r.Post("/v1/publications/{slugOrId}/subscribe", h.publicSubscribeLimiter(h.publicSubscribe).ServeHTTP)
	r.Get("/v1/publications/{slugOrId}/profile", h.publicPublisherProfile)
}

// RegisterProtected — routes créateur authentifiées JWT (ou clé API via
// CombinedAuth). requireScope applique le moindre privilège aux clés API
// (les requêtes JWT passent : couvertes par le RBAC publication).
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.Get("/v1/users/me", h.userMe)
	r.Post("/v1/users/{id}/follow", h.followToggle)
	// Comptes privés : boîte de réception et décision des demandes d'abonnement.
	r.Get("/v1/me/follow-requests", h.followRequests)
	r.Post("/v1/me/follow-requests/{id}/accept", h.acceptFollowRequest)
	r.Post("/v1/me/follow-requests/{id}/reject", h.rejectFollowRequest)
	r.Delete("/v1/me/followers/{userId}", h.removeFollower)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/categories", h.categories)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/categories", h.createCategory)
	r.With(requireScope(middleware.ScopeWrite)).Patch("/v1/categories/{id}", h.updateCategory)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/categories/{id}", h.deleteCategory)
	// Recommandations croisées de publications
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/creator/recommendations", h.apiRecommendationsList)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/creator/recommendations", h.apiRecommendationAdd)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/creator/recommendations/{recommendedId}", h.apiRecommendationRemove)
}

// RegisterRoutes enregistre les routes créateur (alias conventionnel).
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Delete("/v1/me/followers/{userId}", h.removeFollower)
}

// category est la forme API d'une catégorie (parité Hono).
type category struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Description   *string `json:"description"`
	ParentID      *string `json:"parentId"`
	IsDefault     bool    `json:"isDefault"`
	ArticlesCount int32   `json:"articlesCount"`
}

func (h *Handler) categories(w http.ResponseWriter, r *http.Request) {
	pubID := r.URL.Query().Get("publisherId")
	if pubID == "" {
		pubID, _ = middleware.PublisherID(r.Context())
	}
	if pubID == "" {
		response.NotFound(w, "Publisher not found")
		return
	}

	// Garantit l'existence de la catégorie par défaut (« Non classé »)
	// même pour les publications créées après la migration.
	if _, err := h.q.EnsureDefaultCategory(r.Context(), pubID); err != nil {
		log.Printf("[creator] ensureDefaultCategory: %v", err)
	}

	rows, err := h.q.ListCategoriesByPublisher(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] categories: %v", err)
		response.Internal(w)
		return
	}

	out := make([]category, 0, len(rows))
	for _, row := range rows {
		desc := (*string)(nil)
		if row.Description.Valid {
			desc = &row.Description.String
		}
		parentID := (*string)(nil)
		if row.ParentId.Valid {
			parentID = &row.ParentId.String
		}
		out = append(out, category{
			ID:            row.ID,
			Name:          row.Name,
			Slug:          row.Slug,
			Description:   desc,
			ParentID:      parentID,
			IsDefault:     row.IsDefault,
			ArticlesCount: row.ArticlesCount,
		})
	}
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600")
	response.OK(w, map[string]any{"data": out})
}

// authorizeCategories vérifie que l'utilisateur peut gérer les catégories de la publication.
func (h *Handler) authorizeCategories(ctx context.Context, userID, publisherID string) error {
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
			return nil
		}
	}
	if personal, err := h.q.GetUserPersonalPublisher(ctx, userID); err == nil && personal.String == publisherID {
		return nil
	}
	member, err := h.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if err != nil {
		return errForbidden
	}
	if !permissions.CanMedia(&permissions.MediaMember{
		Role: member.Role, Permissions: member.Permissions, Status: member.Status,
	}, permissions.PermManageCategories) {
		return errForbidden
	}
	return nil
}

// categoryInput est la charge utile de création/édition d'une catégorie.
type categoryInput struct {
	PublisherID string  `json:"publisherId"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	Description   *string `json:"description"`
	ParentID      *string `json:"parentId"`
}

func (h *Handler) createCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in categoryInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublisherID == "" || in.Name == "" {
		response.BadRequest(w, "publisherId et name requis")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, in.PublisherID); err != nil {
		response.Forbidden(w, "Accès refusé à cette publication.")
		return
	}

	finalSlug := slug.Slugify(in.Slug)
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = "cat-" + slug.ShortID(8)
	}
	if identifier.IsReservedTenantRoute(finalSlug) {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est réservé par une page du site. Choisissez un autre nom.", finalSlug))
		return
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublisherId: in.PublisherID, Slug: finalSlug, ID: "",
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	var parentID pgtype.Text
	if in.ParentID != nil && *in.ParentID != "" {
		parent, err := h.q.GetCategoryByID(r.Context(), *in.ParentID)
		if err != nil {
			response.BadRequest(w, "Catégorie parente introuvable.")
			return
		}
		if parent.PublisherId != in.PublisherID {
			response.BadRequest(w, "La catégorie parente n'appartient pas à cette publication.")
			return
		}
		if parent.ParentId.Valid && parent.ParentId.String != "" {
			response.BadRequest(w, "Une sous-catégorie ne peut pas avoir de sous-catégorie (limite de 2 niveaux).")
			return
		}
		parentID = textVal(in.ParentID)
	}

	row, err := h.q.CreateCategory(r.Context(), db.CreateCategoryParams{
		Name:          in.Name,
		Slug:          finalSlug,
		Description:   textVal(in.Description),
		PublisherId: in.PublisherID,
		ParentId:      parentID,
	})
	if err != nil {
		log.Printf("[creator] createCategory: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, row)
}

func (h *Handler) updateCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in categoryInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublisherId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à modifier cette catégorie.")
		return
	}
	if existing.IsDefault {
		response.BadRequest(w, "La catégorie par défaut « Non classé » ne peut pas être modifiée.")
		return
	}

	if in.Name == "" {
		in.Name = existing.Name
	}

	finalSlug := slug.Slugify(in.Slug)
	if finalSlug == "" {
		finalSlug = slug.Slugify(in.Name)
	}
	if finalSlug == "" {
		finalSlug = existing.Slug
	}
	// Un slug historique déjà réservé reste éditable (grandfathering) ; seul
	// un changement vers un slug réservé est refusé.
	if finalSlug != existing.Slug && identifier.IsReservedTenantRoute(finalSlug) {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est réservé par une page du site. Choisissez un autre nom.", finalSlug))
		return
	}
	exists, err := h.q.CheckCategorySlugExists(r.Context(), db.CheckCategorySlugExistsParams{
		PublisherId: existing.PublisherId, Slug: finalSlug, ID: id,
	})
	if err == nil && exists {
		response.BadRequest(w, fmt.Sprintf("Le slug %q est déjà utilisé par une autre de vos catégories.", finalSlug))
		return
	}

	parentID := existing.ParentId
	if in.ParentID != nil {
		if *in.ParentID == "" {
			parentID = pgtype.Text{Valid: false}
		} else {
			if *in.ParentID == id {
				response.BadRequest(w, "Une catégorie ne peut pas être sa propre parente.")
				return
			}
			parent, err := h.q.GetCategoryByID(r.Context(), *in.ParentID)
			if err != nil {
				response.BadRequest(w, "Catégorie parente introuvable.")
				return
			}
			if parent.PublisherId != existing.PublisherId {
				response.BadRequest(w, "La catégorie parente n'appartient pas à cette publication.")
				return
			}
			if parent.ParentId.Valid && parent.ParentId.String != "" {
				response.BadRequest(w, "Une sous-catégorie ne peut pas avoir de sous-catégorie (limite de 2 niveaux).")
				return
			}
			// Empêcher de convertir une catégorie mère contenant des sous-catégories en sous-catégorie
			siblings, err := h.q.ListCategoriesByPublisher(r.Context(), existing.PublisherId)
			if err == nil {
				for _, sib := range siblings {
					if sib.ParentId.Valid && sib.ParentId.String == id {
						response.BadRequest(w, "Cette catégorie contient déjà des sous-catégories et ne peut pas devenir une sous-catégorie.")
						return
					}
				}
			}
			parentID = textVal(in.ParentID)
		}
	}

	desc := textVal(in.Description)
	if in.Description == nil && existing.Description.Valid {
		desc = existing.Description
	}

	if err := h.q.UpdateCategory(r.Context(), db.UpdateCategoryParams{
		ID:          id,
		Name:        in.Name,
		Slug:        finalSlug,
		Description: desc,
		ParentId:    parentID,
	}); err != nil {
		log.Printf("[creator] updateCategory: %v", err)
		response.Internal(w)
		return
	}
	row, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.OK(w, map[string]bool{"success": true})
		return
	}
	response.OK(w, row)
}

func (h *Handler) deleteCategory(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.q.GetCategoryByID(r.Context(), id)
	if err != nil {
		response.NotFound(w, "Catégorie introuvable.")
		return
	}
	if err := h.authorizeCategories(r.Context(), userID, existing.PublisherId); err != nil {
		response.Forbidden(w, "Vous n'êtes pas autorisé à supprimer cette catégorie.")
		return
	}
	if existing.IsDefault {
		response.BadRequest(w, "La catégorie par défaut « Non classé » ne peut pas être supprimée.")
		return
	}
	if err := h.q.DeleteCategory(r.Context(), id); err != nil {
		log.Printf("[creator] deleteCategory: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// analyticsStats proxi Umami (stats + topPages) pour la publication du créateur.
func (h *Handler) analyticsStats(w http.ResponseWriter, r *http.Request) {
	websiteID, ok := middleware.UmamiWebsiteID(r.Context())
	if !ok || websiteID == "" {
		websiteID = h.defaultWeb
	}

	now := time.Now()
	startAt := r.URL.Query().Get("startAt")
	endAt := r.URL.Query().Get("endAt")

	start := now.AddDate(0, 0, -30).UnixMilli()
	end := now.UnixMilli()
	if v, err := strconv.ParseInt(startAt, 10, 64); err == nil {
		start = v
	}
	if v, err := strconv.ParseInt(endAt, 10, 64); err == nil {
		end = v
	}

	if websiteID == "" {
		response.OK(w, map[string]any{"data": map[string]any{
			"stats":    map[string]int{"pageviews": 0, "visitors": 0, "visits": 0, "bounces": 0, "totaltime": 0},
			"topPages": []umami.PageMetric{},
		}})
		return
	}

	ctx := r.Context()
	stats, err := h.umami.WebsiteStats(ctx, websiteID, start, end)
	if err != nil {
		log.Printf("[creator] umami stats: %v", err)
	}
	topPages, err := h.umami.TopPages(ctx, websiteID, start, end, 10)
	if err != nil {
		log.Printf("[creator] umami topPages: %v", err)
	}
	if topPages == nil {
		topPages = []umami.PageMetric{}
	}

	response.OK(w, map[string]any{"data": map[string]any{"stats": stats, "topPages": topPages}})
}

// userMe retourne le profil complet + compteurs (parité Hono /v1/users/me).
func (h *Handler) userMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	row, err := h.q.GetUserByIDFull(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// JIT Auto-provisioning : si l'utilisateur est authentifié via Supabase Auth
			// mais que la ligne User n'est pas encore créée dans la base PostgreSQL locale,
			// on la provisionne automatiquement pour auto-guérir le compte.
			claims := middleware.Claims(r.Context())
			email, _ := claims["email"].(string)
			meta, _ := claims["user_metadata"].(map[string]any)
			name := "Utilisateur"
			username := "user"
			if meta != nil {
				if n, ok := meta["full_name"].(string); ok && n != "" {
					name = n
				} else if n, ok := meta["name"].(string); ok && n != "" {
					name = n
				}
				if u, ok := meta["username"].(string); ok && u != "" {
					username = u
				}
			}
			if email != "" && username == "user" {
				username = strings.Split(email, "@")[0]
			}
			if email != "" && name == "Utilisateur" {
				name = strings.Title(strings.Split(email, "@")[0])
			}

			// Provisionne la publication personnelle et la ligne User
			pubID := "pub_" + strings.ReplaceAll(userID, "-", "")
			if len(pubID) > 36 {
				pubID = pubID[:36]
			}
			slugVal := slug.Slugify(username)
			if slugVal == "" {
				slugVal = "user"
			}

			_, _ = h.pool.Exec(r.Context(), `
				INSERT INTO "Publisher" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
				VALUES ($1, 'PERSONAL', $2, $3, $3, now(), now())
				ON CONFLICT (id) DO NOTHING`, pubID, name, slugVal)

			_, _ = h.pool.Exec(r.Context(), `
				INSERT INTO "User" (id, email, name, username, role, "publisherId", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, 'user', $5, now(), now())
				ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, username = $4, "publisherId" = $5, "updatedAt" = now()`,
				toUUID(userID), email, name, username, pubID)

			// Re-fetch de la ligne fraîchement créée
			row, err = h.q.GetUserByIDFull(r.Context(), userID)
			if err != nil {
				log.Printf("[creator] userMe auto-provision failed: %v", err)
				response.NotFound(w, "User not found")
				return
			}
		} else {
			log.Printf("[creator] userMe: %v", err)
			response.Internal(w)
			return
		}
	}

	following, err := h.q.CountFollowing(r.Context(), toUUID(userID))
	if err != nil {
		log.Printf("[creator] userMe following: %v", err)
		response.Internal(w)
		return
	}

	var followers int32
	if row.PublisherId.Valid && row.PublisherId.String != "" {
		if n, err := h.q.CountFollowers(r.Context(), row.PublisherId.String); err == nil {
			followers = n
		}
	}

	// Avatar du compte : logo personnel (User.logoUrl), sinon logo de la
	// publication personnelle (convention PERSONAL : avatar auteur ?? logo pub).
	var publisherLogoUrl *string
	if row.PublisherId.Valid && row.PublisherId.String != "" {
		var logo pgtype.Text
		if err := h.pool.QueryRow(r.Context(), `SELECT "logoUrl" FROM "Publisher" WHERE id = $1`, row.PublisherId.String).Scan(&logo); err == nil && logo.Valid {
			publisherLogoUrl = &logo.String
		}
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":                     row.UserID,
		"email":                  row.Email,
		"username":               textPtr(row.Username),
		"name":                   textPtr(row.Name),
		"role":                   row.Role,
		"isCertified":            row.IsCertified,
		"isShadowbanned":         row.IsShadowbanned,
		"isSuspended":            row.IsSuspended,
		"suspendReason":          textPtr(row.SuspendReason),
		"forceStandardTheme":     row.ForceStandardTheme,
		"onboardingText":         textPtr(row.OnboardingText),
		"logoUrl":                textPtr(row.LogoUrl),
		"publisherLogoUrl":     publisherLogoUrl,
		"publisherId":          textPtr(row.PublisherId),
		"advancedSettingsMode":   row.AdvancedSettingsMode,
		"hasCompletedOnboarding": row.HasCompletedOnboarding,
		"apiAccessStatus":        row.ApiAccessStatus,
		"apiGrants":              row.ApiGrants,
		"apiApplicationReason":   textPtr(row.ApiApplicationReason),
		"walletBalanceCents":     row.WalletBalanceCents,
		"createdAt":              timestampPtr(row.CreatedAt),
		"updatedAt":              timestampPtr(row.UpdatedAt),
		"stats":                  map[string]int32{"followingCount": following, "followersCount": followers},
	}})
}

// userByUsername résout une publication par slug OU subdomain (parité Hono),
// avec fallback sur User.username ou User.id pour les comptes personnels.
// publicProfileIdentity dérive le type public du profil depuis SA publication.
// Aucun `MediaMember` n'entre dans cette décision : le profil personnel d'un
// membre de média reste PERSONAL, seul un profil de publication média est MEDIA.
func publicProfileIdentity(publicationType db.PublisherType) string {
	return identity.FromPublisherType(string(publicationType))
}

func (h *Handler) userByUsername(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "username")

	row, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Fallback : cherche si c'est un User.username ou User.id
			var pubID pgtype.Text
			var uID, uName, uUsername string
			var uBio, uLogo pgtype.Text
			var uCreatedAt pgtype.Timestamp
			errUser := h.pool.QueryRow(r.Context(), `
				SELECT id, "publisherId", COALESCE(name, username, 'Lecteur'), COALESCE(username, id::text), "onboardingText", "logoUrl", "createdAt"
				FROM "User" 
				WHERE LOWER(username) = LOWER($1) 
				   OR id::text = $1 
				   OR "publisherId" = $1
				LIMIT 1`, username).Scan(&uID, &pubID, &uName, &uUsername, &uBio, &uLogo, &uCreatedAt)
			if errUser == nil {
				if pubID.Valid && pubID.String != "" {
					row, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), pubID.String)
				} else {
					row = db.GetPublisherBySlugOrSubdomainRow{
						ID:             uID,
						Type:           db.PublisherTypePERSONAL,
						Name:           uName,
						Slug:           uUsername,
						HeroText:       uBio,
						LogoUrl:        uLogo,
						CreatedAt:      uCreatedAt,
						FollowersCount: 0,
						ArticlesCount:  0,
					}
					err = nil
				}
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			log.Printf("[creator] userByUsername: %v", err)
			response.Internal(w)
			return
		}
	}

	viewerID, _ := middleware.UserID(r.Context())

	// Nombre d'abonnements du propriétaire de la publication (CountFollowing)
	// + id du User propriétaire (isOwnProfile côté client) + pronoms (profil inclusif).
	var followingCount int32
	var ownerUserID string
	var pronouns *string
	var onboardingText *string
	displaySlug := row.Slug
	if ownerID, err := h.q.GetPublisherOwner(r.Context(), row.ID); err == nil {
		ownerUserID = ownerID
		if n, err := h.q.CountFollowing(r.Context(), toUUID(ownerID)); err == nil {
			followingCount = n
		}
		if row.Type != db.PublisherTypeMEDIA {
			if p, err := h.q.GetUserPronouns(r.Context(), ownerID); err == nil && p.Valid {
				pronouns = &p.String
			}
		}
		var uUsername, uOnboarding pgtype.Text
		if err := h.pool.QueryRow(r.Context(), `SELECT username, "onboardingText" FROM "User" WHERE id = $1`, toUUID(ownerID)).Scan(&uUsername, &uOnboarding); err == nil {
			if row.Type == db.PublisherTypePERSONAL && uUsername.Valid && uUsername.String != "" {
				displaySlug = uUsername.String
			}
			if row.Type == db.PublisherTypePERSONAL && uOnboarding.Valid && strings.TrimSpace(uOnboarding.String) != "" {
				loc := strings.TrimSpace(uOnboarding.String)
				onboardingText = &loc
			}
		}
	}

	// Un média n'emprunte ni les pronoms ni la localisation de son owner :
	// sa localisation est une métadonnée de la publication.
	if row.Type == db.PublisherTypeMEDIA {
		var mediaLocation pgtype.Text
		if err := h.pool.QueryRow(r.Context(),
			`SELECT NULLIF(BTRIM("siteOptions"->>'location'), '') FROM "Publisher" WHERE id = $1`,
			row.ID).Scan(&mediaLocation); err == nil && mediaLocation.Valid {
			onboardingText = &mediaLocation.String
		}
	}

	access, err := h.resolveProfileAccess(r.Context(), row.ID, viewerID)
	if err != nil {
		log.Printf("[creator] userByUsername access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if access.OwnerID != "" {
		ownerUserID = access.OwnerID
	}

	// Métadonnées étendues de la publication (site web, supportUrl, réseaux sociaux)
	var website *string
	var supportUrl *string
	var socialLinks any

	var siteOptJSON []byte
	var supp pgtype.Text
	if err := h.pool.QueryRow(r.Context(),
		`SELECT "supportUrl", "siteOptions" FROM "Publisher" WHERE id = $1`,
		row.ID).Scan(&supp, &siteOptJSON); err == nil {
		if supp.Valid && strings.TrimSpace(supp.String) != "" {
			s := strings.TrimSpace(supp.String)
			supportUrl = &s
		}
		if len(siteOptJSON) > 0 {
			var opt map[string]any
			if json.Unmarshal(siteOptJSON, &opt) == nil {
				if w, ok := opt["website"].(string); ok && strings.TrimSpace(w) != "" {
					ws := strings.TrimSpace(w)
					website = &ws
				}
				if sl, ok := opt["socialLinks"]; ok {
					socialLinks = sl
				}
			}
		}
	}

	response.OK(w, map[string]any{"data": map[string]any{
		"id":                row.ID,
		"ownerUserId":       ownerUserID,
		"name":              row.Name,
		"slug":              displaySlug,
		"subdomain":         textPtr(row.Subdomain),
		"customDomain":      textPtr(row.CustomDomain),
		"heroText":          textPtr(row.HeroText),
		"onboardingText":    onboardingText,
		"logoUrl":           textPtr(row.LogoUrl),
		"headerImageUrl":    textPtr(row.HeaderImageUrl),
		"website":           website,
		"supportUrl":        supportUrl,
		"socialLinks":       socialLinks,
		"isCertified":       row.IsCertified,
		"isFollowing":       access.IsFollowing,
		"followRequested":   access.Requested,
		"profileVisibility": access.Visibility,
		"isPrivate":         access.Visibility == "PRIVATE",
		"canViewContent":    access.CanViewContent,
		"pronouns":          pronouns,
		"createdAt":         timestampPtr(row.CreatedAt),
		"type":              publicProfileIdentity(row.Type),
		"_count":            map[string]int32{"followers": row.FollowersCount, "following": followingCount, "articles": row.ArticlesCount},
	}})
}

// followActor est un utilisateur listé dans followers/following.
type followActor struct {
	ID            string  `json:"id"`
	PublisherID *string `json:"publisherId"`
	Name          *string `json:"name"`
	Username      *string `json:"username"`
	LogoURL       *string `json:"logoUrl"`
	IsCertified   bool    `json:"isCertified"`
	FollowedAt    string  `json:"followedAt"`
	ViewerFollows bool    `json:"viewerFollows"`
}

// followPage est une page d'abonnés/abonnements paginée.
type followPage struct {
	Items      []followActor `json:"items"`
	NextCursor string        `json:"nextCursor"`
	HasMore    bool          `json:"hasMore"`
}

// userFollowers — GET /v1/users/{username}/followers : abonnés d'une publication.
func (h *Handler) userFollowers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	username := chi.URLParam(r, "username")
	limit, offset := parseFollowPage(r)

	pub, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			var userPubID pgtype.Text
			if errUser := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, username).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
				pub, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), userPubID.String)
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			response.Internal(w)
			return
		}
	}

	access, err := h.resolveProfileAccess(r.Context(), pub.ID, userID)
	if err != nil {
		log.Printf("[creator] followers access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if !access.CanViewContent {
		response.Forbidden(w, "Ce compte est privé.")
		return
	}

	rows, err := h.q.ListFollowersByPublisher(r.Context(), db.ListFollowersByPublisherParams{
		PublisherId: pub.ID,
		ViewerID:      toUUID(userID),
		Limit:         int32(limit + 1),
		Offset:        int32(offset),
	})
	if err != nil {
		log.Printf("[creator] followers: %v", err)
		response.Internal(w)
		return
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]followActor, 0, len(rows))
	for _, row := range rows {
		pubID := row.UserPublisherID
		items = append(items, followActor{
			ID:            row.UserID,
			PublisherID: &pubID,
			Name:          textPtr(row.UserName),
			Username:      textPtr(row.UserUsername),
			LogoURL:       textPtr(row.UserLogo),
			IsCertified:   row.UserCertified,
			FollowedAt:    row.FollowedAt.Time.Format(time.RFC3339),
			ViewerFollows: row.ViewerFollows,
		})
	}

	page := followPage{Items: items, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(rows))
	}
	response.OK(w, page)
}

// userFollowing — GET /v1/users/{username}/following : abonnements d'un user.
func (h *Handler) userFollowing(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	username := chi.URLParam(r, "username")
	limit, offset := parseFollowPage(r)

	pub, err := h.q.GetPublisherBySlugOrSubdomain(r.Context(), username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			var userPubID pgtype.Text
			if errUser := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, username).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
				pub, err = h.q.GetPublisherBySlugOrSubdomain(r.Context(), userPubID.String)
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "User not found")
				return
			}
			response.Internal(w)
			return
		}
	}
	ownerID, err := h.q.GetPublisherOwner(r.Context(), pub.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "User not found")
			return
		}
		response.Internal(w)
		return
	}

	access, err := h.resolveProfileAccess(r.Context(), pub.ID, userID)
	if err != nil {
		log.Printf("[creator] following access: %v", err)
		response.Internal(w)
		return
	}
	if access.Blocked {
		response.NotFound(w, "User not found")
		return
	}
	if !access.CanViewContent {
		response.Forbidden(w, "Ce compte est privé.")
		return
	}

	rows, err := h.q.ListFollowingByUser(r.Context(), db.ListFollowingByUserParams{
		ReaderId: toUUID(ownerID),
		ViewerID: toUUID(userID),
		Limit:    int32(limit + 1),
		Offset:   int32(offset),
	})
	if err != nil {
		log.Printf("[creator] following: %v", err)
		response.Internal(w)
		return
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	items := make([]followActor, 0, len(rows))
	for _, row := range rows {
		pubID := row.UserPublisherID
		items = append(items, followActor{
			ID:            row.UserID,
			PublisherID: &pubID,
			Name:          stringPtr(row.UserName),
			Username:      stringPtr(row.UserUsername),
			LogoURL:       textPtr(row.UserLogo),
			IsCertified:   row.UserCertified,
			FollowedAt:    row.FollowedAt.Time.Format(time.RFC3339),
			ViewerFollows: row.ViewerFollows,
		})
	}

	page := followPage{Items: items, HasMore: hasMore}
	if hasMore {
		page.NextCursor = fmt.Sprintf("%d", offset+len(rows))
	}
	response.OK(w, page)
}

func parseFollowPage(r *http.Request) (limit, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if c := r.URL.Query().Get("cursor"); c != "" {
		offset, _ = strconv.Atoi(c)
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// followToggle suit/se désabonne d'une publication (parité Hono /v1/users/{id}/follow).
// Un compte PRIVATE transforme le follow en demande à approuver ; un second
// clic sur « Demandé » annule la demande.
func (h *Handler) followToggle(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	// Défense en profondeur : la route est derrière CombinedAuth, mais un
	// contexte sans session ne doit jamais atteindre le SQL (sinon 500).
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	targetID := chi.URLParam(r, "id")
	ctx := r.Context()

	// Résout targetID vers l'ID de publication si un slug, username ou User.id est passé
	pubID := targetID
	if pub, err := h.q.GetPublisherBySlugOrSubdomain(ctx, targetID); err == nil {
		pubID = pub.ID
	} else {
		var userPubID pgtype.Text
		if errUser := h.pool.QueryRow(ctx, `SELECT "publisherId" FROM "User" WHERE id::text = $1 OR lower(username) = lower($1)`, targetID).Scan(&userPubID); errUser == nil && userPubID.Valid && userPubID.String != "" {
			pubID = userPubID.String
		}
	}

	access, err := h.resolveProfileAccess(ctx, pubID, userID)
	if err != nil {
		log.Printf("[creator] follow access: %v", err)
		response.Internal(w)
		return
	}
	if access.OwnerID == "" {
		response.NotFound(w, "User not found")
		return
	}
	if access.Blocked {
		response.Forbidden(w, "Action impossible avec cet utilisateur.")
		return
	}
	if access.OwnerID == userID {
		pubTypeRow, errPub := h.q.GetPublisherTypeByID(ctx, pubID)
		if errPub != nil || pubTypeRow.Type != db.PublisherTypeMEDIA {
			response.BadRequest(w, "You cannot follow yourself")
			return
		}
	}

	params := db.GetExistingFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}

	if _, err := h.q.GetExistingFollow(ctx, params); err == nil {
		if err := h.q.DeleteFollow(ctx, db.DeleteFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}); err != nil {
			log.Printf("[creator] unfollow: %v", err)
			response.Internal(w)
			return
		}
		if err := deleteFollowNotification(ctx, h.q, pubID, userID); err != nil {
			log.Printf("[creator] delete follow notification: %v", err)
		}
		h.cancelFollowRequest(ctx, userID, pubID)
		count, err := h.q.CountFollowers(ctx, pubID)
		if err != nil {
			count = 0
		}
		response.OK(w, map[string]any{"data": map[string]any{"following": false, "requested": false, "followersCount": count}})
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		log.Printf("[creator] follow check: %v", err)
		response.Internal(w)
		return
	}

	// Une demande est déjà en attente : le clic l'annule.
	if access.Requested {
		h.cancelFollowRequest(ctx, userID, pubID)
		count, err := h.q.CountFollowers(ctx, pubID)
		if err != nil {
			count = 0
		}
		response.OK(w, map[string]any{"data": map[string]any{"following": false, "requested": false, "followersCount": count}})
		return
	}

	// Compte privé : le follow devient une demande à approuver.
	if access.Visibility == "PRIVATE" {
		if err := h.q.InsertFollowRequest(ctx, db.InsertFollowRequestParams{
			RequesterId:   toUUID(userID),
			PublisherId: pubID,
		}); err != nil {
			log.Printf("[creator] follow request: %v", err)
			response.Internal(w)
			return
		}
		if err := notifyFollowRequest(ctx, h.q, pubID, userID); err != nil {
			log.Printf("[creator] follow request notification: %v", err)
		}
		count, err := h.q.CountFollowers(ctx, pubID)
		if err != nil {
			count = 0
		}
		response.OK(w, map[string]any{"data": map[string]any{"following": false, "requested": true, "followersCount": count}})
		return
	}

	if err := h.q.InsertFollow(ctx, db.InsertFollowParams{ReaderId: toUUID(userID), PublisherId: pubID}); err != nil {
		log.Printf("[creator] follow: %v", err)
		response.Internal(w)
		return
	}
	if err := notifyFollow(ctx, h.q, pubID, userID); err != nil {
		log.Printf("[creator] follow notification: %v", err)
	}
	count, err := h.q.CountFollowers(ctx, pubID)
	if err != nil {
		count = 0
	}
	response.OK(w, map[string]any{"data": map[string]any{"following": true, "requested": false, "followersCount": count}})
}

// notifyFollow crée la notification FOLLOW au propriétaire d'une publication
// (PERSONAL → créateur, MEDIA → membre owner). Best-effort, respecte les
// préférences du destinataire et déduplique les suivis non lus.
func notifyFollow(ctx context.Context, tq ServiceQuerier, publisherID, senderID string) error {
	ownerID, err := tq.GetPublisherOwner(ctx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if ownerID == "" || ownerID == senderID {
		return nil
	}

	ownerUUID := toUUID(ownerID)
	senderUUID := toUUID(senderID)

	prefs, err := tq.GetFollowPrefs(ctx, ownerUUID)
	if err == nil {
		if !prefs.EmailFollows && !prefs.PushFollows {
			return nil
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	exists, err := tq.ExistsUnreadFollowNotification(ctx, db.ExistsUnreadFollowNotificationParams{
		RecipientId:   ownerUUID,
		SenderId:      senderUUID,
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			exists = 0
		} else {
			return err
		}
	}
	if exists == 1 {
		return nil
	}

	return tq.InsertFollowNotification(ctx, db.InsertFollowNotificationParams{
		RecipientId:   ownerUUID,
		SenderId:      senderUUID,
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	})
}

// deleteFollowNotification supprime la notification FOLLOW lors d'un unfollow.
func deleteFollowNotification(ctx context.Context, tq ServiceQuerier, publisherID, senderID string) error {
	ownerID, err := tq.GetPublisherOwner(ctx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	if ownerID == "" || ownerID == senderID {
		return nil
	}

	return tq.DeleteFollowNotification(ctx, db.DeleteFollowNotificationParams{
		RecipientId:   toUUID(ownerID),
		SenderId:      toUUID(senderID),
		PublisherId: pgtype.Text{String: publisherID, Valid: true},
	})
}

// removeFollower — DELETE /v1/me/followers/{userId} : retire un abonné de la
// publication de l'utilisateur (compte perso ou publication active).
func (h *Handler) removeFollower(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	if targetUserID == "" {
		response.BadRequest(w, "Identifiant utilisateur requis")
		return
	}

	pubID, _ := middleware.PublisherID(r.Context())
	if pubID == "" {
		var userPubID pgtype.Text
		err := h.pool.QueryRow(r.Context(), `SELECT "publisherId" FROM "User" WHERE id = $1::uuid`, toUUID(userID)).Scan(&userPubID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.NotFound(w, "Utilisateur introuvable")
				return
			}
			log.Printf("[creator] remove follower get user: %v", err)
			response.Internal(w)
			return
		}
		if userPubID.Valid {
			pubID = userPubID.String
		}
	}
	if pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	if _, err := h.pool.Exec(r.Context(), `
		DELETE FROM "Follows"
		WHERE "readerId" = $1::uuid AND "publisherId" = $2
	`, toUUID(targetUserID), pubID); err != nil {
		log.Printf("[creator] remove follower: %v", err)
		response.Internal(w)
		return
	}

	// Suppression d'éventuelles notifications d'abonnement en attente.
	_ = deleteFollowNotification(r.Context(), h.q, pubID, targetUserID)

	response.OK(w, map[string]any{"removed": true})
}

// toUUID convertit un id texte en pgtype.UUID (readerId UUID).
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

func textVal(p *string) pgtype.Text {
	if p == nil || *p == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

var errForbidden = errors.New("permission insuffisante")

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

// parseLimitCursor borne limit (20 défaut, 100 max) et offset.
func parseLimitCursor(r *http.Request) (int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// apiHighlightComments — GET /v1/creator/highlights/{id}/comments :
// discussion d'un surlignage, avec flag isAuthor sur les réponses
// éditoriales de l'auteur de l'article.
func (h *Handler) apiHighlightComments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	comments, err := h.highlightComments(r.Context(), id)
	if err != nil {
		log.Printf("[creator] highlight comments: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"comments": comments})
}
