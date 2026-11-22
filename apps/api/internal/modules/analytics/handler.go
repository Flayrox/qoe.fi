package analytics

import (
	"errors"
	"fmt"
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
		r.Use(middleware.RequireAPIScope(middleware.ScopeAnalytics))
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

// writeServiceError traduit une erreur du service : refus d'accès → 403,
// panne → 500 journalisée. Une panne de base n'est jamais déguisée en refus
// (403) ni en données vides.
func (h *Handler) writeServiceError(w http.ResponseWriter, scope string, err error) {
	if errors.Is(err, errForbidden) {
		response.Forbidden(w, "Permission insuffisante")
		return
	}
	log.Printf("[analytics] %s: %v", scope, err)
	response.Internal(w)
}

func publisherID(r *http.Request) string {
	if id := r.URL.Query().Get("publisherId"); id != "" {
		return id
	}
	id, _ := middleware.PublisherID(r.Context())
	return id
}

func (h *Handler) financial(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	metrics, err := h.svc.Financial(r.Context(), userID, pub)
	if err != nil {
		h.writeServiceError(w, "financial", err)
		return
	}
	response.OK(w, metrics)
}

func (h *Handler) topContent(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	limit := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			response.BadRequest(w, "limit invalide (entier positif attendu)")
			return
		}
		limit = n
	}
	items, err := h.svc.TopContent(r.Context(), userID, pub, limit)
	if err != nil {
		h.writeServiceError(w, "top-content", err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) audience(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	summary, err := h.svc.Audience(r.Context(), userID, pub)
	if err != nil {
		h.writeServiceError(w, "audience", err)
		return
	}
	response.OK(w, summary)
}

// audienceSubscribers expose la liste des abonnés (page audience studio).
// GET /v1/analytics/audience/subscribers?publisherId=xxx
func (h *Handler) audienceSubscribers(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	subs, err := h.svc.ListSubscribers(r.Context(), userID, pub)
	if err != nil {
		h.writeServiceError(w, "audience/subscribers", err)
		return
	}
	response.OK(w, map[string]any{"subscribers": subs})
}

// umamiReturning expose visiteurs nouveaux vs récurrents (DB Umami).
//
// Trois issues distinctes : site non provisionné → forme du contrat à zéro
// (le client lit `returningVisitors` sans garde), base Umami non configurée →
// 503, panne → 500. Servir des zéros dans les deux derniers cas faisait
// passer une indisponibilité pour une absence de trafic.
func (h *Handler) umamiReturning(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	// La borne se valide avant la résolution du site : une requête illisible
	// reste une faute de l'appelant, même sans Umami provisionné.
	startAt, endAt, err := parsePeriod(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	websiteID, err := h.svc.publicationWebsiteID(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errNoUmamiSite) {
			response.OK(w, ReturningVisitors{})
			return
		}
		h.writeServiceError(w, "umami/returning", err)
		return
	}
	out, err := h.svc.ReturningVisitors(r.Context(), websiteID, startAt, endAt)
	if err != nil {
		if errors.Is(err, errUmamiUnavailable) {
			response.Error(w, http.StatusServiceUnavailable, "Statistiques Umami indisponibles")
			return
		}
		log.Printf("[analytics] umami/returning: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, out)
}

// umamiHours expose la heatmap des visites par heure (DB Umami).
func (h *Handler) umamiHours(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	startAt, endAt, err := parsePeriod(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	websiteID, err := h.svc.publicationWebsiteID(r.Context(), userID, pub)
	if err != nil {
		if errors.Is(err, errNoUmamiSite) {
			// Tableau vide, jamais un objet, pour que le client itère sans se
			// demander si la donnée existe.
			response.OK(w, []HourVisit{})
			return
		}
		h.writeServiceError(w, "umami/hours", err)
		return
	}
	out, err := h.svc.VisitsByHour(r.Context(), websiteID, startAt, endAt)
	if err != nil {
		if errors.Is(err, errUmamiUnavailable) {
			response.Error(w, http.StatusServiceUnavailable, "Statistiques Umami indisponibles")
			return
		}
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
	since, err := parseSince(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	out, err := h.svc.GetArticleReadingStats(r.Context(), userID, articleID, since)
	if err != nil {
		h.writeServiceError(w, "reading-sessions", err)
		return
	}
	response.OK(w, out)
}

// creatorAnalytics expose les stats agrégées créateur (vues plein + provenance + série).
// GET /v1/analytics/creator?publisherId=xxx&period=30d
func (h *Handler) creatorAnalytics(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	if err := h.svc.requireAccess(r.Context(), userID, pub); err != nil {
		h.writeServiceError(w, "creator", err)
		return
	}
	since, err := parseSince(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	out, err := h.svc.GetCreatorReadingStats(r.Context(), userID, pub, since)
	if err != nil {
		h.writeServiceError(w, "creator", err)
		return
	}
	response.OK(w, out)
}

// provenance expose le breakdown provenance seul (léger).
// GET /v1/analytics/provenance?publisherId=xxx&period=30d
func (h *Handler) provenance(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	if err := h.svc.requireAccess(r.Context(), userID, pub); err != nil {
		h.writeServiceError(w, "provenance", err)
		return
	}
	since, err := parseSince(r)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	out, err := h.svc.GetProvenance(r.Context(), userID, pub, since)
	if err != nil {
		h.writeServiceError(w, "provenance", err)
		return
	}
	response.OK(w, out)
}

// audienceInsights expose la démographie agrégée (gender/age/country/language) créateur + plateforme.
// GET /v1/analytics/audience/insights?publisherId=xxx
func (h *Handler) audienceInsights(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	out, err := h.svc.GetAudienceInsights(r.Context(), userID, pub)
	if err != nil {
		h.writeServiceError(w, "audience/insights", err)
		return
	}
	response.OK(w, out)
}

// parseSince convertit ?period= (24h|7d|30d|90d|all) ou ?startAt= en *time.Time
// (nil = tout l'historique). Une période ou une borne illisible est une faute
// de l'appelant : elle ne devient pas silencieusement « 30 derniers jours ».
func parseSince(r *http.Request) (*time.Time, error) {
	q := r.URL.Query()
	if v := q.Get("startAt"); v != "" {
		ms, err := strconv.ParseInt(v, 10, 64)
		if err != nil || ms <= 0 {
			return nil, errors.New("startAt invalide (epoch ms attendu)")
		}
		t := time.UnixMilli(ms)
		return &t, nil
	}
	switch period := q.Get("period"); period {
	case "", "30d":
		t := time.Now().Add(-30 * 24 * time.Hour)
		return &t, nil
	case "24h":
		t := time.Now().Add(-24 * time.Hour)
		return &t, nil
	case "7d":
		t := time.Now().Add(-7 * 24 * time.Hour)
		return &t, nil
	case "90d":
		t := time.Now().Add(-90 * 24 * time.Hour)
		return &t, nil
	case "all":
		return nil, nil
	default:
		return nil, fmt.Errorf("period invalide: %q", period)
	}
}

// parsePeriod lit startAt/endAt (epoch ms) avec défaut 30 jours, en refusant
// les bornes illisibles ou inversées.
func parsePeriod(r *http.Request) (int64, int64, error) {
	q := r.URL.Query()
	endAt := time.Now().UnixMilli()
	startAt := endAt - 30*24*60*60*1000
	if v := q.Get("startAt"); v != "" {
		ms, err := strconv.ParseInt(v, 10, 64)
		if err != nil || ms <= 0 {
			return 0, 0, errors.New("startAt invalide (epoch ms attendu)")
		}
		startAt = ms
	}
	if v := q.Get("endAt"); v != "" {
		ms, err := strconv.ParseInt(v, 10, 64)
		if err != nil || ms <= 0 {
			return 0, 0, errors.New("endAt invalide (epoch ms attendu)")
		}
		if ms < startAt {
			return 0, 0, errors.New("endAt doit être postérieur à startAt")
		}
		endAt = ms
	}
	return startAt, endAt, nil
}

// GET /v1/analytics/product-metrics — métriques produit de la page analytics
// (abonnés, top articles avec bookmarks/comments/highlights, catégories,
// qualité de lecture) — parité getCreatorAnalyticsData Prisma.
func (h *Handler) productMetrics(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	out, err := h.svc.ProductMetrics(r.Context(), userID, pub)
	if err != nil {
		h.writeServiceError(w, "product-metrics", err)
		return
	}
	response.OK(w, out)
}

// GET /v1/analytics/dashboard?publisherId=&workspaceType=PERSONAL|MEDIA
// — page d'accueil du studio (métriques, articles récents, brouillons,
// pensées programmées, dernier écrit, lectures 30j).
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pub := publisherID(r)
	if pub == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	workspaceType := r.URL.Query().Get("workspaceType")
	if workspaceType == "" {
		workspaceType = "PERSONAL"
	}
	if workspaceType != "PERSONAL" && workspaceType != "MEDIA" {
		response.BadRequest(w, "workspaceType doit être PERSONAL ou MEDIA")
		return
	}
	out, err := h.svc.DashboardOverview(r.Context(), userID, pub, workspaceType)
	if err != nil {
		h.writeServiceError(w, "dashboard", err)
		return
	}
	response.OK(w, out)
}
