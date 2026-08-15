package webhooks

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

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
// requireScope est injecté depuis main.go (middleware.RequireAPIScope).
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.Route("/v1/webhooks", func(r chi.Router) {
		r.With(requireScope(middleware.ScopeRead)).Get("/", h.list)
		r.With(requireScope(middleware.ScopeWrite)).Post("/", h.create)
		r.With(requireScope(middleware.ScopeRead)).Get("/{id}/deliveries", h.listDeliveries)
		r.With(requireScope(middleware.ScopeWrite)).Delete("/{id}", h.delete)
	})
}

// publicationID résout la publication depuis la clé API (contexte) ou le query
// param `publicationId` (JWT / backward-compat), comme le module articles.
func publicationID(r *http.Request) (string, bool) {
	if pid, ok := middleware.PublicationID(r.Context()); ok && pid != "" {
		return pid, true
	}
	if pid := r.URL.Query().Get("publicationId"); pid != "" {
		return pid, true
	}
	return "", false
}

// GET /v1/webhooks — liste les abonnements de la publication.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	items, err := h.svc.List(r.Context(), userID, pid)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"data": items})
}

type createInput struct {
	Name   string   `json:"name"`
	URL    string   `json:"url"`
	Events []string `json:"events"`
}

// POST /v1/webhooks — crée un abonnement (secret retourné une seule fois).
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.URL == "" {
		response.BadRequest(w, "url requis")
		return
	}
	item, err := h.svc.Create(r.Context(), userID, pid, in.Name, in.URL, in.Events)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.Created(w, map[string]any{"data": item})
}

// DELETE /v1/webhooks/{id} — supprime un abonnement.
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pid, ok := publicationID(r)
	if !ok {
		response.BadRequest(w, "publicationId requis")
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), userID, pid, id); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// GET /v1/webhooks/{id}/deliveries?limit= — logs de livraison.
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
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"data": items})
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, err.Error())
	case errors.Is(err, errNotFound):
		response.NotFound(w, err.Error())
	case errors.Is(err, errInvalidURL), errors.Is(err, errNoEvents), errors.Is(err, errInvalidEvent):
		response.BadRequest(w, err.Error())
	default:
		log.Printf("[webhooks] %v", err)
		response.Internal(w)
	}
}
