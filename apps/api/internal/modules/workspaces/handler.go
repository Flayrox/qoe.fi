package workspaces

import (
	"net/http"

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
	r.Route("/v1/workspaces", func(r chi.Router) {
		r.Get("/active", h.getActive)
	})
}

func (h *Handler) getActive(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	mediaID := r.URL.Query().Get("mediaId")
	ws, err := h.svc.GetActive(r.Context(), userID, mediaID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, ws)
}
