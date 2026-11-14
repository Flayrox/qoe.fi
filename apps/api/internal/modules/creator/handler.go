// Package creator — API créateur (migration depuis Hono apps/api).
// catégories, analytics/stats (proxy Umami), users (me/:username/follow).
package creator

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/secguard"
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
	sec       *secguard.Guard
}

// SetSecurityGuard branche le garde de sécurité temps réel (Trust + GCRA + churn).
func (h *Handler) SetSecurityGuard(g *secguard.Guard) *Handler {
	h.sec = g
	return h
}

func (h *Handler) invalidateFollowTrust(ctx context.Context, actorID, targetUserID string) {
	if h.sec == nil {
		return
	}
	h.sec.InvalidateTrust(ctx, actorID)
	if targetUserID != "" && targetUserID != actorID {
		h.sec.InvalidateTrust(ctx, targetUserID)
	}
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

