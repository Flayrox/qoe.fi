package devtools

import (
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose l'inspecteur DevTools (dev-only, superadmin).
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register enregistre les routes DevTools (groupe protégé JWT).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/devtools/data", h.data)
}

// GET /v1/devtools/data — utilisateurs + compteurs (réservé superadmin).
func (h *Handler) data(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}

	data, err := h.svc.GetData(r.Context(), userID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès réservé au superadmin.")
			return
		}
		log.Printf("[devtools] data: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, data)
}
