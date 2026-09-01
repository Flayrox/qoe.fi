package newsletters

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les routes newsletters (créateur + désabonnement public).
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register monte les routes dans le groupe protégé (JWT/API key créateur).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/newsletters", h.list)
	r.Post("/v1/newsletters", h.create)
	r.Patch("/v1/newsletters/{id}", h.update)
	r.Delete("/v1/newsletters/{id}", h.delete)
	r.Post("/v1/newsletters/{id}/send", h.send)
}

// RegisterPublic monte le désabonnement (GET simple, sans auth — lien email).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/newsletters/unsubscribe", h.unsubscribe)
}

func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid, ok := middleware.UserID(r.Context())
	if !ok || uid == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return uid, true
}

func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, err.Error())
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Newsletter introuvable.")
	case errors.Is(err, errNotDraft):
		response.BadRequest(w, err.Error())
	case errors.Is(err, pgx.ErrNoRows):
		response.NotFound(w, "Newsletter introuvable.")
	default:
		log.Printf("[newsletters] %v", err)
		response.Internal(w)
	}
}

// GET /v1/newsletters?publicationId= — liste des newsletters du créateur.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	items, err := h.svc.ListIssues(r.Context(), uid, r.URL.Query().Get("publicationId"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// POST /v1/newsletters — crée un brouillon.
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	issue, err := h.svc.CreateDraft(r.Context(), uid, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, issue)
}

// PATCH /v1/newsletters/{id} — met à jour un brouillon.
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	issue, err := h.svc.UpdateDraft(r.Context(), uid, chi.URLParam(r, "id"), in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, issue)
}

// DELETE /v1/newsletters/{id} — supprime un brouillon.
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteDraft(r.Context(), uid, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/newsletters/{id}/send — déclenche l'envoi (asynq).
func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(w, r)
	if !ok {
		return
	}
	if err := h.svc.Send(r.Context(), uid, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/newsletters/unsubscribe?publicationId=&email= — désabonnement
// one-click (RFC 8058) : désactive receiveArticles, sans authentification.
func (h *Handler) unsubscribe(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Unsubscribe(r.Context(), r.URL.Query().Get("publicationId"), r.URL.Query().Get("email")); err != nil {
		h.handleErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Désabonnement</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="background:#fff;border-radius:12px;padding:32px;max-width:420px;text-align:center;">
<h1 style="font-size:18px;color:#111;margin:0 0 8px;">Vous êtes désabonné(e)</h1>
<p style="font-size:14px;color:#555;margin:0;">Vous ne recevrez plus de newsletters de cette publication. Vous pouvez vous réabonner à tout moment.</p>
</div></body></html>`))
}
