package analytics

import (
	"errors"
	"log"
	"net/http"
	"strconv"

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
