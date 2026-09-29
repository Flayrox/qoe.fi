package appeals

// Routes recours côté utilisateur (authentifié, Y COMPRIS suspendu : le
// middleware n'exclut pas les suspendus de l'auth — contester reste possible,
// fiche tranche 6 : ouverture accessible quand un compte est restreint).

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les routes recours.
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

// RegisterProtected enregistre les routes recours (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/appeals", h.list)
	r.Post("/v1/appeals", h.open)
	r.Get("/v1/appeals/{id}", h.detail)
	r.Post("/v1/appeals/{id}/messages", h.addMessage)
}

func (h *Handler) mapErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, abuse.ErrAppealForbidden):
		response.Forbidden(w, err.Error())
	case errors.Is(err, abuse.ErrAppealNotFound):
		// 404 aussi pour « pas à vous » (pas de fuite d'existence).
		response.NotFound(w, "Recours introuvable.")
	case errors.Is(err, abuse.ErrNothingToAppeal):
		response.NotFound(w, err.Error())
	case errors.Is(err, abuse.ErrAppealAlreadyOpen):
		response.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, abuse.ErrAppealClosed):
		response.Error(w, http.StatusGone, err.Error())
	case errors.Is(err, abuse.ErrInvalidAppeal):
		response.BadRequest(w, err.Error())
	default:
		response.Internal(w)
	}
}

// GET /v1/appeals — mes dossiers de recours.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAppeals(r.Context(), uid, limit, offset)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/appeals — contester une mesure visant mon compte.
// Body : { "subjectType": "user", "subjectId": "<moi>", "message": "..." }.
// L'ouverture NE LÈVE RIEN : seule une décision staff overturned clôturera.
func (h *Handler) open(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in struct {
		SubjectType string `json:"subjectType"`
		SubjectID   string `json:"subjectId"`
		Message     string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SubjectType == "" || in.SubjectID == "" {
		response.BadRequest(w, "JSON invalide (subjectType, subjectId et message requis)")
		return
	}
	a, err := h.svc.OpenAppeal(r.Context(), uid, in.SubjectType, in.SubjectID, in.Message)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, a)
}

// GET /v1/appeals/{id} — mon dossier avec ses messages.
func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	a, err := h.svc.GetAppeal(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, a)
}

// POST /v1/appeals/{id}/messages — écrire à mon dossier (clos = 410).
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
	a, err := h.svc.AddMessage(r.Context(), uid, chi.URLParam(r, "id"), in.Body)
	if err != nil {
		h.mapErr(w, err)
		return
	}
	response.OK(w, a)
}
