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
		r.Get("/umami/returning", h.umamiReturning)
		r.Get("/umami/hours", h.umamiHours)
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
		log.Printf("[analytics] umami/returning: %v", err)
		response.Internal(w)
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
		log.Printf("[analytics] umami/hours: %v", err)
		response.Internal(w)
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
