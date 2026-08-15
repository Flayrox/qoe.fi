package webhooks

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api-go/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register enregistre les routes webhooks (auth requise).
func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/webhooks", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/", h.create)
		r.Delete("/{id}", h.delete)
		r.Post("/{id}/toggle", h.toggle)
		r.Post("/{id}/test", h.test)
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	items, err := h.svc.List(r.Context(), publicationID)
	if err != nil {
		log.Printf("[webhooks] list: %v", err)
		response.Internal(w)
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

	wh, secret, err := h.svc.Create(r.Context(), in.PublicationID, in.Name, in.URL, events)
	if err != nil {
		log.Printf("[webhooks] create: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, map[string]any{"webhook": wh, "secret": secret})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publicationID := r.URL.Query().Get("publicationId")
	if err := h.svc.Delete(r.Context(), id, publicationID); err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) toggle(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publicationID := r.URL.Query().Get("publicationId")
	active, err := h.svc.Toggle(r.Context(), id, publicationID)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "active": active})
}

func (h *Handler) test(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publicationID := r.URL.Query().Get("publicationId")
	res, err := h.svc.Test(r.Context(), id, publicationID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Webhook introuvable")
			return
		}
		// Erreur réseau → réponse 200 avec le détail (miroir du TS).
		response.OK(w, map[string]any{"success": false, "status": res.Status, "response": res.Response})
		return
	}
	response.OK(w, map[string]any{"success": true, "status": res.Status, "response": res.Response})
}

func (h *Handler) writeWebhookError(w http.ResponseWriter, err error) {
	if errors.Is(err, errNotFound) {
		response.NotFound(w, "Webhook introuvable")
		return
	}
	log.Printf("[webhooks] %v", err)
	response.Internal(w)
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
