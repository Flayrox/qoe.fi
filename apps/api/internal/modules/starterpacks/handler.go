package starterpacks

import (
	"encoding/json"
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

// RegisterPublic — lecture publique des packs (auth optionnelle).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/starter-packs", h.list)
	r.Get("/v1/starter-packs/{id}", h.get)
}

// RegisterProtected — création + follow-all (auth requise via le groupe).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/starter-packs", h.create)
	r.Post("/v1/starter-packs/{id}/follow-all", h.followAll)
}

// GET /v1/starter-packs?limit=&offset= — liste paginée.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	packs, err := h.svc.List(r.Context(), limit, offset)
	if err != nil {
		log.Printf("[starterpacks] list: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"starterPacks": packs})
}

// GET /v1/starter-packs/{id} — détail.
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pack, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, errStarterPackNotFound) {
			response.NotFound(w, "StarterPack introuvable")
			return
		}
		log.Printf("[starterpacks] get: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"starterPack": pack})
}

type createInput struct {
	Title       string   `json:"title"`
	Description *string  `json:"description"`
	Icon        *string  `json:"icon"`
	UserIds     []string `json:"userIds"`
}

// POST /v1/starter-packs — crée un pack (publication personnelle de l'auteur).
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.Title == "" {
		response.BadRequest(w, "Title is required")
		return
	}

	pack, err := h.svc.Create(r.Context(), userID, in.Title, in.Description, in.Icon, in.UserIds)
	if err != nil {
		log.Printf("[starterpacks] create: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, map[string]any{"starterPack": pack})
}

// POST /v1/starter-packs/{id}/follow-all — suit tous les membres (1-click).
func (h *Handler) followAll(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	count, err := h.svc.FollowAll(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errStarterPackNotFound) {
			response.NotFound(w, "StarterPack introuvable")
			return
		}
		log.Printf("[starterpacks] follow-all: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]int{"followedCount": count})
}
