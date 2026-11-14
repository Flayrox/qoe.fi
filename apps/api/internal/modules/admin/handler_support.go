package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/support"
)

// GET /v1/admin/support/tickets — file (ouverts d'abord).
func (h *Handler) supportTickets(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListSupportTickets(r.Context(), userID, r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// GET /v1/admin/support/tickets/{id} — un dossier avec ses messages.
func (h *Handler) supportTicketDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	t, err := h.svc.GetSupportTicket(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrTicketNotFound) {
			response.NotFound(w, "Dossier introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, t)
}

// POST /v1/admin/support/tickets/{id}/assign — prise en main.
func (h *Handler) assignSupportTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	t, err := h.svc.AssignSupportTicket(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrTicketNotFound) {
			response.NotFound(w, "Dossier introuvable.")
			return
		}
		if errors.Is(err, support.ErrTicketClosed) {
			response.Error(w, http.StatusGone, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, t)
}

// PATCH /v1/admin/support/tickets/{id} — avancement / clôture.
func (h *Handler) updateSupportTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Status    string `json:"status"`
		StaffNote string `json:"staffNote"`
		Reply     string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	t, err := h.svc.UpdateSupportTicket(r.Context(), userID, chi.URLParam(r, "id"), in.Status, in.StaffNote, in.Reply)
	if err != nil {
		switch {
		case errors.Is(err, support.ErrTicketNotFound):
			response.NotFound(w, "Dossier introuvable.")
		case errors.Is(err, support.ErrTicketClosed):
			response.Error(w, http.StatusGone, err.Error())
		case errors.Is(err, support.ErrInvalidTicket):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, t)
}

// GET /v1/admin/support/metrics — charge.
func (h *Handler) supportMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	m, err := h.svc.SupportMetrics(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, m)
}

// GET /v1/admin/support/articles — tout (brouillons inclus pour la revue).
func (h *Handler) supportArticles(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListSupportArticles(r.Context(), userID, limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/admin/support/articles — crée un BROUILLON.
func (h *Handler) createSupportArticle(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Slug     string `json:"slug"`
		TitleFr  string `json:"titleFr"`
		TitleEn  string `json:"titleEn"`
		BodyFr   string `json:"bodyFr"`
		BodyEn   string `json:"bodyEn"`
		Position int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Slug == "" {
		response.BadRequest(w, "JSON invalide (slug, titres et textes requis)")
		return
	}
	a, err := h.svc.CreateSupportArticle(r.Context(), userID, in.Slug, in.TitleFr, in.TitleEn, in.BodyFr, in.BodyEn, in.Position)
	if err != nil {
		if errors.Is(err, support.ErrInvalidArticle) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// GET /v1/admin/support/articles/{id} — détail.
func (h *Handler) supportArticleDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	a, err := h.svc.GetSupportArticle(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, support.ErrArticleNotFound) {
			response.NotFound(w, "Article introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, a)
}

// PATCH /v1/admin/support/articles/{id} — modifie.
func (h *Handler) updateSupportArticle(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		TitleFr   string `json:"titleFr"`
		TitleEn   string `json:"titleEn"`
		BodyFr    string `json:"bodyFr"`
		BodyEn    string `json:"bodyEn"`
		Position  *int   `json:"position"`
		Published *bool  `json:"published"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	a, err := h.svc.UpdateSupportArticle(r.Context(), userID, chi.URLParam(r, "id"), in.TitleFr, in.TitleEn, in.BodyFr, in.BodyEn, in.Position, in.Published)
	if err != nil {
		switch {
		case errors.Is(err, support.ErrArticleNotFound):
			response.NotFound(w, "Article introuvable.")
		case errors.Is(err, support.ErrInvalidArticle):
			response.BadRequest(w, err.Error())
		default:
			h.handleErr(w, err)
		}
		return
	}
	response.OK(w, a)
}
