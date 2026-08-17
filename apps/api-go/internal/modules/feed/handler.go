package feed

import (
	"errors"
	"log"
	"net/http"
	"strconv"

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

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/feed", func(r chi.Router) {
		r.Get("/", h.following)
		r.Get("/trending", h.trending)
	})
	r.Get("/v1/posts/{id}/thread", h.thread)
}

// RegisterPublic enregistre les routes de lecture publique (auth optionnelle) :
// les pensées d'un profil, ses articles, et les articles du feed.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/users/{username}/posts", h.userPosts)
	r.Get("/v1/users/{username}/articles", h.userArticles)
	r.Get("/v1/feed/articles", h.articles)
}

// userArticles — articles publiés d'une publication (profil), paginés.
func (h *Handler) userArticles(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "username")
	limit, offset := parseLimitCursor(r)

	result, err := h.svc.PublicationArticles(r.Context(), username, limit, offset)
	if err != nil {
		log.Printf("[feed] userArticles: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, result)
}

// userPosts — pensées publiques d'un utilisateur, résolu par slug/subdomain.
func (h *Handler) userPosts(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	username := chi.URLParam(r, "username")
	limit, offset := parseLimitCursor(r)

	items, err := h.svc.UserPosts(r.Context(), username, userID, limit, offset)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		log.Printf("[feed] userPosts: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

func (h *Handler) thread(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	thread, err := h.svc.Thread(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			response.NotFound(w, "Post introuvable")
			return
		}
		log.Printf("[feed] thread: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"post": thread})
}

func parseLimitCursor(r *http.Request) (limit int, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset = ParseCursor(r.URL.Query().Get("cursor"))
	return limit, offset
}

func (h *Handler) following(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitCursor(r)

	items, err := h.svc.FollowingFeed(r.Context(), userID, limit, offset)
	if err != nil {
		log.Printf("[feed] following: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

func (h *Handler) trending(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitCursor(r)

	items, err := h.svc.Trending(r.Context(), userID, limit, offset)
	if err != nil {
		log.Printf("[feed] trending: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

// articles — articles publiés récents du feed mobile (GET /v1/feed/articles).
func (h *Handler) articles(w http.ResponseWriter, r *http.Request) {
	limit, offset := parseLimitCursor(r)

	items, err := h.svc.RecentArticles(r.Context(), limit, offset)
	if err != nil {
		log.Printf("[feed] articles: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}
