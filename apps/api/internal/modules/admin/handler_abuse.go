package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/response"
)

// GET /v1/admin/reports — file de modération (pending en premier).
func (h *Handler) reports(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, err := h.svc.ListReports(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	pending, err := h.svc.CountPendingReports(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "pending": pending})
}

// PATCH /v1/admin/reports/{id} — clôture + action de modération.
func (h *Handler) resolveReport(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Action string `json:"action"`
		Note   string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Action == "" {
		response.BadRequest(w, "JSON invalide (action requise)")
		return
	}
	data, err := h.svc.ResolveReport(r.Context(), userID, chi.URLParam(r, "id"), in.Action, in.Note)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/abuse/decisions — dossiers ouverts du noyau anti-abus.
func (h *Handler) abuseDecisions(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseDecisions(r.Context(), userID, limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// PATCH /v1/admin/abuse/decisions — clôture humaine d'un dossier.
func (h *Handler) resolveAbuseDecision(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		SubjectType string `json:"subjectType"`
		SubjectID   string `json:"subjectId"`
		Result      string `json:"result"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil ||
		in.SubjectType == "" || in.SubjectID == "" || in.Result == "" {
		response.BadRequest(w, "JSON invalide (subjectType, subjectId et result requis)")
		return
	}
	id, err := h.svc.ResolveAbuseDecision(r.Context(), userID, in.SubjectType, in.SubjectID, in.Result, in.Note)
	if err != nil {
		switch {
		case errors.Is(err, errForbidden):
			response.Forbidden(w, "Accès réservé au superadmin.")
		case errors.Is(err, abuse.ErrNoOpenDecision):
			response.NotFound(w, "Aucune décision ouverte pour ce sujet.")
		case errors.Is(err, abuse.ErrInvalidHumanResult):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, map[string]any{"id": id})
}

// GET /v1/admin/abuse/metrics — santé anti-abus.
func (h *Handler) abuseMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	m, err := h.svc.AbuseMetrics(r.Context(), userID, days)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, m)
}

// GET /v1/admin/security/overview — cockpit Sécurité & Trust (30 jours).
func (h *Handler) securityOverview(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	overview, err := h.svc.SecurityOverview(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, overview)
}

// POST /v1/admin/security/trust/{userId}/recompute — recalcul à chaud du score Trust.
func (h *Handler) recomputeUserTrust(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	res, err := h.svc.RecomputeUserTrust(r.Context(), actorID, targetUserID)
	if err != nil {
		switch {
		case errors.Is(err, errInvalidTargetUser):
			response.BadRequest(w, err.Error())
		case errors.Is(err, errTrustServiceUnavailable):
			response.Error(w, http.StatusServiceUnavailable, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, res)
}

// GET /v1/admin/abuse/incidents — dossiers d'attaques.
func (h *Handler) abuseIncidents(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseIncidents(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/admin/abuse/incidents — ouvre un dossier.
func (h *Handler) openAbuseIncident(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Title  string `json:"title"`
		Kind   string `json:"kind"`
		Scope  string `json:"scope"`
		Impact string `json:"impact"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Title == "" || in.Kind == "" {
		response.BadRequest(w, "JSON invalide (title et kind requis)")
		return
	}
	d, err := h.svc.OpenAbuseIncident(r.Context(), userID, in.Title, in.Kind, in.Scope, in.Impact)
	if err != nil {
		if errors.Is(err, abuse.ErrInvalidIncident) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, d)
}

// PATCH /v1/admin/abuse/incidents/{id} — fait avancer un dossier.
func (h *Handler) updateAbuseIncident(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Status  string `json:"status"`
		Scope   string `json:"scope"`
		Impact  string `json:"impact"`
		Measure string `json:"measure"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	d, err := h.svc.UpdateAbuseIncident(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.Scope, in.Impact, in.Measure)
	if err != nil {
		switch {
		case errors.Is(err, abuse.ErrNoIncident):
			response.NotFound(w, "Incident introuvable.")
		case errors.Is(err, abuse.ErrInvalidIncident):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, d)
}

// GET /v1/admin/abuse/appeals — file des recours.
func (h *Handler) abuseAppeals(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListAbuseAppeals(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// GET /v1/admin/abuse/appeals/{id} — un recours avec ses messages.
func (h *Handler) abuseAppealDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	a, err := h.svc.GetAbuseAppeal(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, abuse.ErrAppealNotFound) {
			response.NotFound(w, "Recours introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// PATCH /v1/admin/abuse/appeals/{id} — tranche un recours.
func (h *Handler) decideAbuseAppeal(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Status    string `json:"status"`
		Outcome   string `json:"outcome"`
		StaffNote string `json:"staffNote"`
		Reply     string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	a, err := h.svc.DecideAbuseAppeal(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.Outcome, in.StaffNote, in.Reply)
	if err != nil {
		switch {
		case errors.Is(err, abuse.ErrAppealNotFound):
			response.NotFound(w, "Recours introuvable.")
		case errors.Is(err, abuse.ErrAppealClosed):
			response.Error(w, http.StatusGone, err.Error())
		case errors.Is(err, abuse.ErrInvalidAppeal),
			errors.Is(err, abuse.ErrNothingToAppeal):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, a)
}
