package notifications

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
)

const (
	// maxCursor borne la pagination : au-delà, Postgres parcourt la fenêtre
	// pour rien (le centre de notifications n'est pas un export).
	maxCursor = 10_000
	// maxMarkReadIDs borne un marquage explicite : un corps de 2 Mo d'ids
	// remplissait un `ANY` inutile. Vide = « tout marquer ».
	maxMarkReadIDs = 200
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
		// Les créations MEDIA_INVITE / MEDIA_MEMBER_JOINED ne sont plus
		// exposées ici : elles appartiennent au module media (invitation d'un
		// membre, avec ses contrôles de rôle et de tenant) qui écrit la
		// notification côté serveur. Une route cliente permettait à
		// n'importe quel compte de fabriquer une notification vers n'importe
		// quel destinataire.
	})
}

// userID exige une identité exploitable : la route est montée derrière le
// middleware protégé, un handler sans userID doit répondre 401 — pas dégrader
// silencieusement en lecture vide (masquait une mauvaise configuration).
func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	if _, err := uuid.Parse(uid); err != nil {
		response.Unauthorized(w, "Session invalide")
		return "", false
	}
	return uid, true
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	filter := r.URL.Query().Get("filter")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	cursorRaw := r.URL.Query().Get("cursor")
	offset := 0
	if cursorRaw != "" {
		parsed, err := strconv.Atoi(cursorRaw)
		if err != nil || parsed < 0 {
			response.BadRequest(w, "cursor invalide")
			return
		}
		offset = parsed
	}
	if offset > maxCursor {
		offset = maxCursor
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
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	count, err := h.svc.UnreadCount(r.Context(), userID)
	if err != nil {
		log.Printf("[notifications] unread-count: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]int{"count": count})
}

type markReadInput struct {
	NotificationIds []string `json:"notificationIds"`
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in markReadInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if len(in.NotificationIds) > maxMarkReadIDs {
		response.BadRequest(w, "trop de notifications dans une seule requête")
		return
	}
	if err := h.svc.MarkRead(r.Context(), userID, in.NotificationIds); err != nil {
		log.Printf("[notifications] mark-read: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) getPrefs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	prefs, err := h.svc.GetPreferences(r.Context(), userID)
	if err != nil {
		log.Printf("[notifications] get-prefs: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"preferences": prefs})
}

func (h *Handler) updatePrefs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	var patch map[string]bool
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	prefs, err := h.svc.UpdatePreferences(r.Context(), userID, patch)
	if err != nil {
		if secguard.WriteRejection(w, err) {
			return
		}
		log.Printf("[notifications] updatePrefs: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"preferences": prefs})
}
