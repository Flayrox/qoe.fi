package posts

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api-go/internal/middleware"
	"github.com/qoefi/api-go/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

type createThoughtInput struct {
	Content  string   `json:"content"`
	Tags     []string `json:"tags"`
	ParentID *string  `json:"parentId,omitempty"`
	RepostID *string  `json:"repostId,omitempty"`
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/posts", func(r chi.Router) {
		r.Post("/", h.create)
		r.Get("/{id}", h.get)
		r.Post("/{id}/like", h.toggleLike)
		r.Post("/{id}/repost", h.toggleRepost)
		r.Post("/{id}/reply", h.reply)
	})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in createThoughtInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	post, err := h.svc.Create(r.Context(), userID, in.Content, in.Tags, in.ParentID, in.RepostID)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, post)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	post, err := h.svc.Get(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errThoughtNotFound) {
			response.NotFound(w, "Post introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, post)
}

func (h *Handler) toggleLike(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	liked, err := h.svc.ToggleLike(r.Context(), id, userID)
	if err != nil {
		log.Printf("[posts] like: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"liked": liked})
}

func (h *Handler) toggleRepost(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	reposted, err := h.svc.ToggleRepost(r.Context(), id, userID)
	if err != nil {
		log.Printf("[posts] repost: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"reposted": reposted})
}

func (h *Handler) reply(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	parentID := chi.URLParam(r, "id")

	var in createThoughtInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	post, err := h.svc.Create(r.Context(), userID, in.Content, in.Tags, &parentID, nil)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, post)
}
