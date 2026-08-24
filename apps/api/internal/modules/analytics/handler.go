package analytics

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/analytics", func(r chi.Router) {
		r.Get("/financial", h.financial)
		r.Get("/top-content", h.topContent)
		r.Get("/audience", h.audience)
		r.Get("/audience/subscribers", h.audienceSubscribers)
		r.Get("/umami/returning", h.umamiReturning)
		r.Get("/umami/hours", h.umamiHours)
		// Lecture — migration Prisma → Go (ReadingSession)
		r.Get("/reading-sessions", h.readingSessions)
		r.Get("/creator", h.creatorAnalytics)
		r.Get("/provenance", h.provenance)
		r.Get("/audience/insights", h.audienceInsights)
		r.Get("/product-metrics", h.productMetrics)
		r.Get("/dashboard", h.dashboard)
	})
}

func publicationID(r *http.Request) string {
	return r.URL.Query().Get("publicationId")
}

func (h *Handler) financial(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	metrics, err := h.svc.Financial(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] financial: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, metrics)
}

func (h *Handler) topContent(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.TopContent(r.Context(), userID, pub, limit)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] top-content: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

func (h *Handler) audience(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	summary, err := h.svc.Audience(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] audience: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, summary)
}

// audienceSubscribers expose la liste des abonnés (page audience studio).
// GET /v1/analytics/audience/subscribers?publicationId=xxx
func (h *Handler) audienceSubscribers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	subs, err := h.svc.ListSubscribers(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] audience/subscribers: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"subscribers": subs})
}

// umamiReturning expose visiteurs nouveaux vs récurrents (DB Umami).
func (h *Handler) umamiReturning(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	websiteID, err := h.svc.publicationWebsiteID(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		// Publication sans Umami provisionné : dégradation propre.
		response.OK(w, map[string]any{})
		return
	}
	startAt, endAt := parsePeriod(r)
	out, err := h.svc.ReturningVisitors(r.Context(), websiteID, startAt, endAt)
	if err != nil {
		log.Printf("[analytics] umami/returning: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// umamiHours expose la heatmap des visites par heure (DB Umami).
func (h *Handler) umamiHours(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	websiteID, err := h.svc.publicationWebsiteID(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		response.OK(w, map[string]any{})
		return
	}
	startAt, endAt := parsePeriod(r)
	out, err := h.svc.VisitsByHour(r.Context(), websiteID, startAt, endAt)
	if err != nil {
		log.Printf("[analytics] umami/hours: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// readingSessions expose les stats d'un article individuel (plein, par articleId).
// GET /v1/analytics/reading-sessions?articleId=xxx&period=30d
// ou ?articleId=xxx&startAt=epochMs&endAt=epochMs
// Réponse: {articleId, totalViews, timeseries, byHostname, bySource}
func (h *Handler) readingSessions(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := r.URL.Query().Get("articleId")
	if articleID == "" {
		response.BadRequest(w, "articleId requis")
		return
	}
	since := parseSince(r)
	out, err := h.svc.GetArticleReadingStats(r.Context(), userID, articleID, since)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] reading-sessions: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// creatorAnalytics expose les stats agrégées créateur (vues plein + provenance + série).
// GET /v1/analytics/creator?publicationId=xxx&period=30d
func (h *Handler) creatorAnalytics(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if !h.svc.canAccess(r.Context(), userID, pub) {
		response.Forbidden(w, "Permission insuffisante")
		return
	}
	since := parseSince(r)
	out, err := h.svc.GetCreatorReadingStats(r.Context(), userID, pub, since)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] creator: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// provenance expose le breakdown provenance seul (léger).
// GET /v1/analytics/provenance?publicationId=xxx&period=30d
func (h *Handler) provenance(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if !h.svc.canAccess(r.Context(), userID, pub) {
		response.Forbidden(w, "Permission insuffisante")
		return
	}
	since := parseSince(r)
	out, err := h.svc.GetProvenance(r.Context(), userID, pub, since)
	if err != nil {
		log.Printf("[analytics] provenance: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// audienceInsights expose la démographie agrégée (gender/age/country/language) créateur + plateforme.
// GET /v1/analytics/audience/insights?publicationId=xxx
func (h *Handler) audienceInsights(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	out, err := h.svc.GetAudienceInsights(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] audience/insights: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// parseSince convertit ?period= (24h|7d|30d|90d|all) ou ?startAt= en *time.Time (nil = all).
func parseSince(r *http.Request) *time.Time {
	q := r.URL.Query()
	if v := q.Get("startAt"); v != "" {
		if ms, err := strconv.ParseInt(v, 10, 64); err == nil && ms > 0 {
			t := time.UnixMilli(ms)
			return &t
		}
	}
	switch q.Get("period") {
	case "24h":
		t := time.Now().Add(-24 * time.Hour)
		return &t
	case "7d":
		t := time.Now().Add(-7 * 24 * time.Hour)
		return &t
	case "90d":
		t := time.Now().Add(-90 * 24 * time.Hour)
		return &t
	case "all":
		return nil
	case "30d", "":
		// défaut 30d — si period absent mais query contient startAt, déjà géré
		if q.Get("period") == "" && q.Get("startAt") == "" {
			// pour /creator sans param, 30j par défaut
			t := time.Now().Add(-30 * 24 * time.Hour)
			return &t
		}
		if q.Get("period") == "30d" {
			t := time.Now().Add(-30 * 24 * time.Hour)
			return &t
		}
		// period vide + startAt vide -> 30d
		if q.Get("period") == "" {
			t := time.Now().Add(-30 * 24 * time.Hour)
			return &t
		}
		return nil
	default:
		t := time.Now().Add(-30 * 24 * time.Hour)
		return &t
	}
}

// parsePeriod lit startAt/endAt (epoch ms) avec défaut 30 jours.
func parsePeriod(r *http.Request) (int64, int64) {
	endAt := time.Now().UnixMilli()
	startAt := endAt - 30*24*60*60*1000
	if v, err := strconv.ParseInt(r.URL.Query().Get("startAt"), 10, 64); err == nil && v > 0 {
		startAt = v
	}
	if v, err := strconv.ParseInt(r.URL.Query().Get("endAt"), 10, 64); err == nil && v > startAt {
		endAt = v
	}
	return startAt, endAt
}

// GET /v1/analytics/product-metrics — métriques produit de la page analytics
// (abonnés, top articles avec bookmarks/comments/highlights, catégories,
// qualité de lecture) — parité getCreatorAnalyticsData Prisma.
func (h *Handler) productMetrics(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	out, err := h.svc.ProductMetrics(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] product-metrics: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// GET /v1/analytics/dashboard?publicationId=&workspaceType=PERSONAL|MEDIA
// — page d'accueil du studio (métriques, articles récents, brouillons,
// pensées programmées, dernier écrit, lectures 30j).
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publicationID(r)
	if pub == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	workspaceType := r.URL.Query().Get("workspaceType")
	if workspaceType == "" {
		workspaceType = "PERSONAL"
	}
	out, err := h.svc.DashboardOverview(r.Context(), userID, pub, workspaceType)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[analytics] dashboard: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}
