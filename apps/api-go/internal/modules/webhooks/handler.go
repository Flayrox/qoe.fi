package webhooks

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

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

// RegisterProtected enregistre les routes webhooks (auth requise + scopes clé API).
// requireScope est injecté depuis main.go (middleware.RequireAPIScope) : lecture
// = READ, gestion (create/delete/toggle/test) = WRITE.
//
// Routes en siblings directs (pas de r.Route("/v1/webhooks")) : le module
// billing monte aussi /v1/webhooks/{stripe,supabase} — deux sous-arbres sur le
// même chemin font paniquer chi au démarrage (vérifié par le smoke test).
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/webhooks", h.list)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/webhooks", h.create)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/webhooks/{id}/deliveries", h.listDeliveries)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/webhooks/{id}", h.delete)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/webhooks/{id}/toggle", h.toggle)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/webhooks/{id}/test", h.test)
}

// publicationID résout la publication depuis la clé API (contexte) ou le query
// param `publicationId` (JWT / dashboard).
func publicationID(r *http.Request) (string, bool) {
	if pid, ok := middleware.PublicationID(r.Context()); ok && pid != "" {
		return pid, true
	}
	if pid := r.URL.Query().Get("publicationId"); pid != "" {
		return pid, true
	}
	return "", false
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	items, err := h.svc.List(r.Context(), userID, pid)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, items)
}

type createInput struct {
	PublicationID string   `json:"publicationId"`
	Name          string   `json:"name"`
	URL           string   `json:"url"`
	Events        []string `json:"events"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.URL = strings.TrimSpace(in.URL)
	if in.Name == "" || in.URL == "" {
		response.BadRequest(w, "Nom et URL requis")
		return
	}
	if !strings.HasPrefix(strings.ToLower(in.URL), "https://") &&
		!strings.HasPrefix(strings.ToLower(in.URL), "http://localhost") {
		response.BadRequest(w, "L'URL doit commencer par https:// (ou http://localhost en dev)")
		return
	}
	events := filterValidEvents(in.Events)
	if len(events) == 0 {
		response.BadRequest(w, "Sélectionnez au moins un événement")
		return
	}

	pid := in.PublicationID
	if pid == "" {
		if p, ok := publicationID(r); ok {
			pid = p
		}
	}
	if pid == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}

	wh, secret, err := h.svc.Create(r.Context(), userID, pid, in.Name, in.URL, events)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.Created(w, map[string]any{"webhook": wh, "secret": secret})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if err := h.svc.Delete(r.Context(), userID, id, pid); err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) toggle(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	active, err := h.svc.Toggle(r.Context(), userID, id, pid)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "active": active})
}

func (h *Handler) test(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	res, err := h.svc.Test(r.Context(), userID, id, pid)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Webhook introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, err.Error())
			return
		}
		// Erreur réseau → réponse 200 avec le détail (miroir du TS).
		response.OK(w, map[string]any{"success": false, "status": res.Status, "response": res.Response})
		return
	}
	response.OK(w, map[string]any{"success": true, "status": res.Status, "response": res.Response})
}

// GET /v1/webhooks/{id}/deliveries?limit= — logs de livraison détaillés.
func (h *Handler) listDeliveries(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	id := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.svc.ListDeliveries(r.Context(), userID, pid, id, limit)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, items)
}

func (h *Handler) writeWebhookError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Webhook introuvable")
	case errors.Is(err, errForbidden):
		response.Forbidden(w, err.Error())
	default:
		log.Printf("[webhooks] %v", err)
		response.Internal(w)
	}
}

func filterValidEvents(events []string) []string {
	allowed := map[string]bool{}
	for _, e := range ValidWebhookEvents {
		allowed[e] = true
	}
	out := make([]string, 0, len(events))
	seen := map[string]bool{}
	for _, e := range events {
		if allowed[e] && !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	return out
}
