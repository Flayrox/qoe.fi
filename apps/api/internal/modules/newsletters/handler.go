package newsletters

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/redis/go-redis/v9"
)

// Handler expose les routes newsletters (créateur + désabonnement public).
type Handler struct {
	svc *Service

	// sendLimiter (optionnel) est le limiteur Redis de l'envoi : anti-spam
	// « brouillon/publier » — un créateur ne peut déclencher qu'un nombre
	// limité d'envois par fenêtre (défaut si non branché : aucun).
	rc     *redis.Client
	window time.Duration
	max    int
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetSendRateLimit branche le limiteur d'envoi (anti-spam brouillon/publier).
func (h *Handler) SetSendRateLimit(rc *redis.Client, window time.Duration, max int) {
	h.rc = rc
	h.window = window
	h.max = max
}

// Register monte les routes dans le groupe protégé (JWT/API key créateur).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/newsletters", h.list)
	r.Post("/v1/newsletters", h.create)
	r.Patch("/v1/newsletters/{id}", h.update)
	r.Delete("/v1/newsletters/{id}", h.delete)
	if h.rc != nil {
		r.With(middleware.RateLimit("newsletter-send", h.rc, h.window, h.max, true)).
			Post("/v1/newsletters/{id}/send", h.send)
		return
	}
	r.Post("/v1/newsletters/{id}/send", h.send)
}

// RegisterPublic monte le désabonnement (GET pour lien web et POST pour RFC 8058 one-click).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/newsletters/unsubscribe", h.unsubscribe)
	r.Post("/v1/newsletters/unsubscribe", h.unsubscribe)
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

// GET & POST /v1/newsletters/unsubscribe?pub=&email= — désabonnement
// one-click (RFC 8058) : désactive receiveArticles, sans authentification.
func (h *Handler) unsubscribe(w http.ResponseWriter, r *http.Request) {
	pubID := r.URL.Query().Get("pub")
	if pubID == "" {
		pubID = r.URL.Query().Get("publicationId")
	}
	email := r.URL.Query().Get("email")

	if err := h.svc.Unsubscribe(r.Context(), pubID, email); err != nil {
		h.handleErr(w, err)
		return
	}

	if r.Method == http.MethodPost {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Unsubscribed successfully"))
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Désabonnement réussi</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;-webkit-font-smoothing:antialiased;">
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.04);padding:40px 32px;max-width:440px;width:100%;text-align:center;">
<div style="width:48px;height:48px;background:#f0fdf4;border:1px solid #dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;color:#16a34a;">✓</div>
<h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 8px;letter-spacing:-0.01em;">Vous êtes désabonné(e)</h1>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 24px;">Vous ne recevrez plus les e-mails ni les newsletters de cette publication. Vous pouvez vous réabonner à tout moment depuis le site.</p>
<a href="https://qoe.fi" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:10px 24px;border-radius:9999px;transition:background 0.2s;">Retourner à l'accueil</a>
</div></body></html>`))
}
