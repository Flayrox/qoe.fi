package notifications

import (
	"encoding/json"
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
	r.Route("/v1/notifications", func(r chi.Router) {
		r.Get("/", h.list)
		r.Get("/unread-count", h.unreadCount)
		r.Post("/read", h.markRead)
		r.Get("/preferences", h.getPrefs)
		r.Patch("/preferences", h.updatePrefs)
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	filter := r.URL.Query().Get("filter")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}

	res, err := h.svc.List(r.Context(), userID, filter, limit, offset)
	if err != nil {
		log.Printf("[notifications] list: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, res)
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	count, err := h.svc.UnreadCount(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]int{"count": count})
}

type markReadInput struct {
	NotificationIds []string `json:"notificationIds"`
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in markReadInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.MarkRead(r.Context(), userID, in.NotificationIds); err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) getPrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	prefs, err := h.svc.GetPreferences(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"preferences": prefs})
}

func (h *Handler) updatePrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var patch map[string]bool
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	prefs, err := h.svc.UpdatePreferences(r.Context(), userID, patch)
	if err != nil {
		log.Printf("[notifications] updatePrefs: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"preferences": prefs})
}
