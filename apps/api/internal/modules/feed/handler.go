package feed

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

func (h *Handler) Register(r chi.Router) {
	h.RegisterProtected(r)
	h.RegisterPublic(r)
}

// RegisterProtected enregistre les routes nécessitant une authentification :
// le feed d'abonnements (following) et le feed personnalisé Two-Tower.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/feed", func(r chi.Router) {
		r.Get("/", h.following)
		r.Get("/personalized", h.personalized)
	})
}

// RegisterPublic enregistre les routes de lecture publique (auth optionnelle) :
// le feed tendance, le fil d'un post (thread), les pensées d'un profil, ses articles, et les articles du feed.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/feed/trending", h.trending)
	r.Get("/v1/feed/personalized", h.personalized)
	r.Post("/v1/feed/hydrate", h.hydrate)
	r.Get("/v1/home/feed", h.homeFeed)
	r.Get("/v1/posts/{id}/thread", h.thread)
	r.Get("/v1/users/{username}/posts", h.userPosts)
	r.Get("/v1/users/{username}/articles", h.userArticles)
	r.Get("/v1/feed/articles", h.articles)
}

// homeFeed — bundle de la home lecteur (GET /v1/home/feed, auth optionnelle) :
// créateurs suivis, onglets Suivis/Explorer/Recommandé, bookmarks, compteurs,
// activité 7 jours, mots masqués, article à la une. Remplace home/page.tsx prisma.
func (h *Handler) homeFeed(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	result, err := h.svc.HomeFeed(r.Context(), userID)
	if err != nil {
		log.Printf("[feed] homeFeed: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, result)
}

// hydrate — réhydratation du feed « Pour vous » (POST /v1/feed/hydrate).
// Reçoit les ids classés par le moteur ({itemType, id}) et renvoie les
// articles complets + pensées (FeedSlice) — remplace prisma côté Next.
func (h *Handler) hydrate(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body struct {
		Items []EngineItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if len(body.Items) > 100 {
		response.BadRequest(w, "trop d'items")
		return
	}
	result, err := h.svc.Hydrate(r.Context(), body.Items, userID)
	if err != nil {
		log.Printf("[feed] hydrate: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, result)
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

// personalized — moteur feed Two-Tower mixte (articles + pensées), port Go de
// getPersonalizedFeed (GET /v1/feed/personalized?limit=&offset=&userHour=).
// Auth optionnelle : cold-start (Sim=0.5) si non authentifié.
// Renvoie des engine items {itemType, id, isDiscovery} pour réhydratation client.
func (h *Handler) personalized(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitCursor(r)
	userHour := -1
	if v := r.URL.Query().Get("userHour"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 23 {
			userHour = n
		}
	}
	// Accept also explicit offset param (used server-side by the task).
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	result, err := h.svc.PersonalizedEngine(r.Context(), userID, limit, offset, userHour)
	if err != nil {
		log.Printf("[feed] personalized: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, result)
}
