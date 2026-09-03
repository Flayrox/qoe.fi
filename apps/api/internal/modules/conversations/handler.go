package conversations

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

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
	r.Route("/v1/conversations", func(r chi.Router) {
		r.Post("/", h.create)
		r.Get("/", h.list)
		r.Get("/unread-count", h.unreadCount)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", h.get)
			r.Get("/messages", h.listMessages)
			r.Post("/messages", h.sendMessage)
			r.Post("/read", h.markRead)
		})
	})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in struct {
		ParticipantID string `json:"participantId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	conv, err := h.svc.CreateDirect(r.Context(), userID, in.ParticipantID)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	response.OK(w, conv)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	convs, err := h.svc.List(r.Context(), userID, limit)
	if err != nil {
		log.Printf("[conversations] list: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"conversations": convs})
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	count, err := h.svc.UnreadCount(r.Context(), userID)
	if err != nil {
		log.Printf("[conversations] unread-count: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]int{"count": count})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	conv, err := h.svc.Get(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		h.writeErr(w, err)
		return
	}
	response.OK(w, conv)
}

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var before *time.Time
	if raw := r.URL.Query().Get("before"); raw != "" {
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			response.BadRequest(w, "curseur before invalide (RFC3339 attendu)")
			return
		}
		before = &t
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	page, err := h.svc.ListMessages(r.Context(), userID, chi.URLParam(r, "id"), before, limit)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	response.OK(w, page)
}

func (h *Handler) sendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	msg, err := h.svc.SendMessage(r.Context(), userID, chi.URLParam(r, "id"), in.Content)
	if err != nil {
		h.writeErr(w, err)
		return
	}
	response.Created(w, msg)
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	if err := h.svc.MarkRead(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// writeErr mappe les erreurs métier en réponses HTTP.
func (h *Handler) writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrParticipantMissing):
		response.NotFound(w, "Conversation introuvable")
	case errors.Is(err, ErrSelfDirect):
		response.BadRequest(w, "Impossible de se messager soi-même")
	case errors.Is(err, ErrBlocked):
		response.Forbidden(w, "Conversation bloquée")
	case err != nil && err.Error() == "message vide":
		response.BadRequest(w, "Message vide")
	case err != nil && err.Error() == "message trop long":
		response.BadRequest(w, "Message trop long (2000 caractères max)")
	default:
		log.Printf("[conversations] %v", err)
		response.Internal(w)
	}
}