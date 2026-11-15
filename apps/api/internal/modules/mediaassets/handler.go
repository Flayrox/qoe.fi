package mediaassets

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

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
	r.Get("/v1/media-assets", h.list)
}

// GET /v1/media-assets — bibliothèque personnelle paginée du Studio.
// Filtres : `q` (URL) et `targetType`. Le propriétaire est toujours le JWT.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 60 {
		limit = 24
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	items, err := h.svc.ListByOwner(r.Context(), userID, ListOptions{
		TargetType: strings.TrimSpace(r.URL.Query().Get("targetType")),
		Query:      r.URL.Query().Get("q"),
		Limit:      int32(limit),
		Offset:     int32(offset),
	})
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}

	response.OK(w, map[string]any{
		"items":      items,
		"nextOffset": offset + len(items),
		"hasMore":    len(items) == limit,
	})
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
