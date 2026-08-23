package home

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterPublic(r chi.Router) {
	r.Route("/v1/home", func(r chi.Router) {
		r.Get("/config", h.getConfig)
		r.Get("/trends", h.getTrends)
		r.Get("/promos", h.getPromos)
	})
}

func (h *Handler) getConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetSystemConfig(r.Context())
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, cfg)
}

func (h *Handler) getTrends(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	trends, err := h.svc.GetTrends(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, trends)
}

func (h *Handler) getPromos(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	promos, err := h.svc.GetPromos(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, promos)
}
