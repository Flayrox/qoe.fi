package creator

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/abuse"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/newsletters"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/response"
)

var emailFormatRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// newSubscriberConfirmToken délègue au générateur unique du domaine
// (newsletters.NewConfirmationToken) : un seul format de jeton pour les
// inscriptions publiques, la clé API et les reconfirmations d'import.
func newSubscriberConfirmToken() (string, error) {
	return newsletters.NewConfirmationToken()
}

// registerPendingSubscriber inscrit une adresse en attente de confirmation
// (double opt-in) au lieu de l'activer : crée un abonné NON destinataire
// (receiveArticles = false, confirmedAt NULL) porteur d'un jeton, puis enfile
// l'e-mail de confirmation via le chemin existant (worker confirm_email).
// Ne réactive jamais silencieusement un désabonné : seul son propre clic le
// réactive (ConfirmSubscriberByToken). Retourne l'abonné et s'il faut lui
// envoyer une confirmation (faux s'il est déjà actif et confirmé).
func (h *Handler) registerPendingSubscriber(r *http.Request, pubID, email string) (db.UpsertSubscriberPendingRow, bool, error) {
	ctx := r.Context()
	// Coupe-feu inscriptions (fiche 06 §10) : couvre d'un coup la clé API et
	// le formulaire public (les deux passent par ici), avant tout jeton et
	// toute écriture.
	if abuse.SignupKillEngaged(ctx, h.pool) {
		return db.UpsertSubscriberPendingRow{}, false, abuse.ErrSignupSuspended
	}
	token, err := newSubscriberConfirmToken()
	if err != nil {
		return db.UpsertSubscriberPendingRow{}, false, err
	}
	sub, err := h.q.UpsertSubscriberPending(r.Context(), db.UpsertSubscriberPendingParams{
		Email:       email,
		PublisherID: pubID,
		Token:       token,
	})
	if err != nil {
		return db.UpsertSubscriberPendingRow{}, false, err
	}
	// sqlc type l'expression ("confirmedAt" IS NOT NULL) en interface{} :
	// on l'interprète prudemment (défaut = envoyer la confirmation).
	confirmed, _ := sub.Confirmed.(bool)
	needsConfirm := !(sub.IsActive && sub.ReceiveArticles && confirmed)
	if needsConfirm {
		// Budget anti-abus (fiche 06 P0) : même protection que la voie
		// publique — la clé API ne permet pas d'arroser une adresse au-delà
		// de 3 confirmations/jour. Best-effort pour le reste : une panne
		// Redis n'invalide jamais une inscription déjà enregistrée.
		if !abuse.ConfirmAllowed(ctx, h.pool, email, pubID, time.Now()) {
			log.Printf("[creator] confirmation non envoyée (budget épuisé) %s", email)
			return sub, needsConfirm, nil
		}
		if err := queue.PublishSubscriberConfirm(h.asynq, queue.SubscriberConfirmPayload{
			Email:       email,
			PublisherID: pubID,
		}); err != nil {
			log.Printf("[creator] confirm enqueue %s: %v", email, err)
		}
	}
	return sub, needsConfirm, nil
}

// ─── GET /v1/creator/subscribers ─────────────────────────────────────

type apiSubscriberItem struct {
	ID              string `json:"id"`
	Email           string `json:"email"`
	Status          string `json:"status"`
	IsActive        bool   `json:"isActive"`
	IsPremium       bool   `json:"isPremium"`
	ReceiveArticles bool   `json:"receiveArticles"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type apiSubscribersPage struct {
	Items   []apiSubscriberItem `json:"items"`
	Total   int64               `json:"total"`
	Limit   int                 `json:"limit"`
	Offset  int                 `json:"offset"`
	HasMore bool                `json:"hasMore"`
}

func (h *Handler) apiSubscribersList(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublisherID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	limit, offset := parseLimitCursor(r)

	rows, err := h.q.ListSubscribersByPublisher(r.Context(), db.ListSubscribersByPublisherParams{
		PublisherId: pubID,
		Limit:       int32(limit),
		Offset:      int32(offset),
	})
	if err != nil {
		log.Printf("[creator] list subscribers: %v", err)
		response.Internal(w)
		return
	}

	total, err := h.q.CountSubscribersByPublisher(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] count subscribers: %v", err)
		response.Internal(w)
		return
	}

	items := make([]apiSubscriberItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, apiSubscriberItem{
			ID:              row.ID,
			Email:           row.Email,
			Status:          string(row.Status),
			IsActive:        row.IsActive,
			IsPremium:       row.IsPremium,
			ReceiveArticles: row.ReceiveArticles,
			CreatedAt:       row.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:       row.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	response.OK(w, apiSubscribersPage{
		Items:   items,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
		HasMore: int64(offset+len(items)) < total,
	})
}

// ─── GET /v1/creator/subscribers/stats ───────────────────────────────

type apiSubscribersStatsResponse struct {
	Total   int64 `json:"total"`
	Active  int64 `json:"active"`
	Premium int64 `json:"premium"`
}

func (h *Handler) apiSubscribersStats(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublisherID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	stats, err := h.q.GetSubscriberStatsByPublisher(r.Context(), pubID)
	if err != nil {
		log.Printf("[creator] subscribers stats: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, apiSubscribersStatsResponse{
		Total:   stats.Total,
		Active:  stats.Active,
		Premium: stats.Premium,
	})
}

// ─── POST /v1/creator/subscribers ────────────────────────────────────

type apiSubscriberCreateBody struct {
	Email string `json:"email"`
}

func (h *Handler) apiSubscriberCreate(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublisherID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	var body apiSubscriberCreateBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "Payload JSON invalide")
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if !emailFormatRegex.MatchString(cleanEmail) {
		response.BadRequest(w, "Adresse email invalide")
		return
	}

	// Double opt-in : une clé API ne prouve pas le consentement du
	// destinataire. L'adresse est enregistrée en attente et reçoit une demande
	// de confirmation ; elle ne devient destinataire qu'à son propre clic
	// (fiche 01 : aucune entrée ne crée un abonné actif sans preuve).
	sub, _, err := h.registerPendingSubscriber(r, pubID, cleanEmail)
	if err != nil {
		// Coupe-feu engagé : 503 explicite (clé API comme formulaire —
		// une clé compromise n'arroser personne pendant l'incident).
		if errors.Is(err, abuse.ErrSignupSuspended) {
			w.Header().Set("Retry-After", "300")
			response.Error(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		log.Printf("[creator] upsert subscriber: %v", err)
		response.Internal(w)
		return
	}

	w.WriteHeader(http.StatusCreated)
	response.OK(w, apiSubscriberItem{
		ID:              sub.ID,
		Email:           sub.Email,
		Status:          string(sub.Status),
		IsActive:        sub.IsActive,
		IsPremium:       sub.IsPremium,
		ReceiveArticles: sub.ReceiveArticles,
		CreatedAt:       sub.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       sub.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	})
}

// ─── DELETE /v1/creator/subscribers/{idOrEmail} ──────────────────────

func (h *Handler) apiSubscriberDelete(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublisherID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	target := chi.URLParam(r, "idOrEmail")
	if target == "" {
		response.BadRequest(w, "Identifiant ou email requis")
		return
	}

	_, err := h.q.DeactivateSubscriber(r.Context(), db.DeactivateSubscriberParams{
		PublisherID: pubID,
		ID:          target,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Abonné introuvable pour cette publication")
			return
		}
		log.Printf("[creator] deactivate subscriber: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]bool{"success": true})
}

// ─── GET /v1/creator/publication ─────────────────────────────────────

func (h *Handler) apiPublisherMetadata(w http.ResponseWriter, r *http.Request) {
	pubID, ok := middleware.PublisherID(r.Context())
	if !ok || pubID == "" {
		response.NotFound(w, "Publisher introuvable")
		return
	}

	meta, err := h.q.GetPublisherMetadataByID(r.Context(), pubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publisher introuvable")
			return
		}
		log.Printf("[creator] get publication metadata: %v", err)
		response.Internal(w)
		return
	}

	// Champs étendus (siteOptions, allowDownloadDefault)
	var siteOptionsBytes []byte
	var allowDownloadDefault bool
	if err := h.pool.QueryRow(r.Context(),
		`SELECT "siteOptions", COALESCE("allowDownloadDefault", false) FROM "Publisher" WHERE id = $1`, pubID).
		Scan(&siteOptionsBytes, &allowDownloadDefault); err != nil {
		log.Printf("[creator] publisher site options: %v", err)
		response.Internal(w)
		return
	}
	var siteOptions any
	if len(siteOptionsBytes) > 0 {
		if err := json.Unmarshal(siteOptionsBytes, &siteOptions); err != nil {
			// JSONB illisible en base = corruption de données : mieux vaut une
			// erreur explicite qu'une métadonnée partielle servie comme complète.
			log.Printf("[creator] publisher siteOptions json: %v", err)
			response.Internal(w)
			return
		}
	}

	// Navigation du site headless
	type navItem struct {
		ID         string  `json:"id"`
		Label      string  `json:"label"`
		URL        string  `json:"url"`
		Order      int32   `json:"order"`
		IsExternal bool    `json:"isExternal"`
		ParentID   *string `json:"parentId"`
	}
	navs := []navItem{}
	navRows, nerr := h.pool.Query(r.Context(), `
		SELECT id, label, url, "order", "isExternal", "parentId"
		FROM "NavigationItem"
		WHERE "publisherId" = $1 ORDER BY "order" ASC`, pubID)
	if nerr != nil {
		log.Printf("[creator] publisher navigation: %v", nerr)
		response.Internal(w)
		return
	}
	defer navRows.Close()
	for navRows.Next() {
		var n navItem
		var pID sql.NullString
		if err := navRows.Scan(&n.ID, &n.Label, &n.URL, &n.Order, &n.IsExternal, &pID); err != nil {
			log.Printf("[creator] publisher navigation scan: %v", err)
			response.Internal(w)
			return
		}
		if pID.Valid {
			n.ParentID = &pID.String
		}
		navs = append(navs, n)
	}
	if err := navRows.Err(); err != nil {
		log.Printf("[creator] publisher navigation rows: %v", err)
		response.Internal(w)
		return
	}

	// Réseaux sociaux de la publication
	type socialItem struct {
		ID       string `json:"id"`
		Platform string `json:"platform"`
		URL      string `json:"url"`
		Order    int32  `json:"order"`
	}
	socials := []socialItem{}
	socRows, serr := h.pool.Query(r.Context(), `
		SELECT id, platform, url, "order"
		FROM "SocialLink"
		WHERE "publisherId" = $1 ORDER BY "order" ASC`, pubID)
	if serr != nil {
		log.Printf("[creator] publisher social links: %v", serr)
		response.Internal(w)
		return
	}
	defer socRows.Close()
	for socRows.Next() {
		var sl socialItem
		if err := socRows.Scan(&sl.ID, &sl.Platform, &sl.URL, &sl.Order); err != nil {
			log.Printf("[creator] publisher social link scan: %v", err)
			response.Internal(w)
			return
		}
		socials = append(socials, sl)
	}
	if err := socRows.Err(); err != nil {
		log.Printf("[creator] publisher social link rows: %v", err)
		response.Internal(w)
		return
	}

	payload := map[string]any{
		"id":                     meta.ID,
		"type":                   meta.Type,
		"name":                   meta.Name,
		"slug":                   meta.Slug,
		"bio":                    textPtr(meta.Bio),
		"subdomain":              textPtr(meta.Subdomain),
		"customDomain":           textPtr(meta.CustomDomain),
		"heroText":               textPtr(meta.HeroText),
		"footerText":             textPtr(meta.FooterText),
		"logoUrl":                textPtr(meta.LogoUrl),
		"headerImageUrl":         textPtr(meta.HeaderImageUrl),
		"accentColor":            textPtr(meta.AccentColor),
		"themeMode":              textPtr(meta.ThemeMode),
		"layoutStyle":            textPtr(meta.LayoutStyle),
		"fontFamily":             textPtr(meta.FontFamily),
		"supportUrl":             textPtr(meta.SupportUrl),
		"seoTitle":               textPtr(meta.SeoTitle),
		"seoDescription":         textPtr(meta.SeoDescription),
		"allowIndexing":          meta.AllowIndexing,
		"allowPublicAnnotations": meta.AllowPublicAnnotations,
		"allowComments":          meta.AllowComments,
		"allowDownloadDefault":   allowDownloadDefault,
		"isCertified":            meta.IsCertified,
		"navigation":             navs,
		"socialLinks":            socials,
		"createdAt":              meta.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		"updatedAt":              meta.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	}
	if siteOptions != nil {
		payload["siteOptions"] = siteOptions
	}
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600")
	response.OK(w, payload)
}

// ─── GET /v1/publications/{slugOrId}/profile (Public with CORS) ───

// publicPublisherProfile renvoie le profil public minimal d'une publication
// (nom + logo) pour les intégrations externes (fiche 02) : le site tiers
// affiche « Confirmer l'abonnement à [publication] » sans clé API et sans
// recevoir autre chose. Réponse 404 neutre si inconnue (ne révèle rien).
func (h *Handler) publicPublisherProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	slugOrID := chi.URLParam(r, "slugOrId")
	if slugOrID == "" {
		response.BadRequest(w, "Identifiant ou slug de publication requis")
		return
	}
	profile, err := h.q.GetPublisherPublicProfile(r.Context(), slugOrID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publisher introuvable")
			return
		}
		log.Printf("[public profile] %s: %v", slugOrID, err)
		response.Internal(w)
		return
	}
	var logo *string
	if profile.LogoUrl.Valid && profile.LogoUrl.String != "" {
		logo = &profile.LogoUrl.String
	}
	response.OK(w, map[string]any{
		"id":      profile.ID,
		"name":    profile.Name,
		"logoUrl": logo,
	})
}

// ─── POST /v1/publications/{slugOrId}/subscribe (Public with CORS) ───

func (h *Handler) publicSubscribeOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) publicSubscribe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	slugOrID := chi.URLParam(r, "slugOrId")
	if slugOrID == "" {
		response.BadRequest(w, "Identifiant ou slug de publication requis")
		return
	}

	pubID, err := h.q.ResolvePublisherIDBySlugOrID(r.Context(), slugOrID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publisher introuvable")
			return
		}
		log.Printf("[public subscribe] resolve publication: %v", err)
		response.Internal(w)
		return
	}

	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "Payload JSON invalide")
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(body.Email))
	if !emailFormatRegex.MatchString(cleanEmail) {
		response.BadRequest(w, "Adresse email invalide")
		return
	}

	// Double opt-in (fiche 01) : la réponse reste neutre — elle ne révèle ni
	// l'existence d'un compte ni le statut de l'adresse — et l'abonnement ne
	// devient actif qu'au clic sur le lien envoyé. Une réinscription d'un
	// désabonné ne le réactive pas : seul son propre clic le fait.
	if _, _, err = h.registerPendingSubscriber(r, pubID, cleanEmail); err != nil {
		if errors.Is(err, abuse.ErrSignupSuspended) {
			w.Header().Set("Retry-After", "300")
			response.Error(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		log.Printf("[public subscribe] upsert subscriber: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{
		"success":     true,
		"publisherId": pubID,
	})
}
