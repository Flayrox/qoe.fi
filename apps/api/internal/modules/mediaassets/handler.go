package mediaassets

import (
	"encoding/json"
	"log"
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
	r.Post("/v1/media-assets", h.register)
}

// POST /v1/media-assets — enregistre un MediaAsset (déjà uploadé sur le storage)
// avec dédoublonnage CAS par SHA-256. Le propriétaire est l'utilisateur JWT.
func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	asset, err := h.svc.RegisterAsset(r.Context(), userID, in)
	if err != nil {
		log.Printf("[mediaassets] register: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, toDTO(asset))
}
