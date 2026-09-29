package support

// Routes support côté utilisateur (authentifié, Y COMPRIS restreint :
// demander de l'aide reste possible — tranche 6).

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	internalsupport "github.com/qoefi/api/internal/support"
)

// Handler expose les routes support.
type Handler struct {
	svc *Service
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return uid, true
}

// RegisterProtected enregistre les routes (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/support/tickets", h.list)
	r.Post("/v1/support/tickets", h.open)
	r.Get("/v1/support/tickets/{id}", h.detail)
	r.Post("/v1/support/tickets/{id}/messages", h.addMessage)
}

func (h *Handler) mapErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, internalsupport.ErrTicketForbidden):
		response.Forbidden(w, err.Error())
	case errors.Is(err, internalsupport.ErrTicketNotFound):
		response.NotFound(w, "Dossier introuvable.")
	case errors.Is(err, internalsupport.ErrTicketAlreadyOpen):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, internalsupport.ErrTicketClosed):
		response.Error(w, http.StatusGone, err.Error())
	case errors.Is(err, internalsupport.ErrInvalidTicket):
		response.BadRequest(w, err.Error())
	default:
		response.Internal(w)
	}
}

// GET /v1/support/tickets — mes dossiers.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListTickets(r.Context(), uid, limit, offset)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/support/tickets — ouvrir un dossier.
// Body : { kind, subject, message, relatedType?, relatedId? }.
// L'ouverture NE CHANGE RIEN (ni suspension levée, ni permission accordée).
func (h *Handler) open(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Kind        string `json:"kind"`
		Subject     string `json:"subject"`
		Message     string `json:"message"`
		RelatedType string `json:"relatedType"`
		RelatedID   string `json:"relatedId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Kind == "" || in.Subject == "" {
		response.BadRequest(w, "JSON invalide (kind, subject et message requis)")
		return
	}
	t, err := h.svc.OpenTicket(r.Context(), uid, in.Kind, in.Subject, in.Message, in.RelatedType, in.RelatedID)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}

// GET /v1/support/tickets/{id} — mon dossier avec ses messages.
func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	t, err := h.svc.GetTicket(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}

// POST /v1/support/tickets/{id}/messages — écrire à mon dossier.
func (h *Handler) addMessage(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Body == "" {
		response.BadRequest(w, "JSON invalide (body requis)")
		return
	}
	t, err := h.svc.AddMessage(r.Context(), uid, chi.URLParam(r, "id"), in.Body)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, t)
}
