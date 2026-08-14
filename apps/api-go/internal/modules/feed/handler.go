package feed

import (
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
}

func parseLimitOffset(r *http.Request) (int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func (h *Handler) following(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitOffset(r)

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
	limit, offset := parseLimitOffset(r)

	items, err := h.svc.Trending(r.Context(), userID, limit, offset)
	if err != nil {
		log.Printf("[feed] trending: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}
