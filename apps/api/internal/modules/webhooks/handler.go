package webhooks

import (
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/netguard"
	"github.com/qoefi/api/internal/response"
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

// userID exige une identité exploitable. Sans ce garde, un identifiant
// illisible partait en requête et ressortait en 403 « permission
// insuffisante » (refus métier au lieu d'une session invalide).
func (h *Handler) userID(w http.ResponseWriter, r *http.Request) (string, bool) {
	if p, ok := middleware.GetPrincipal(r.Context()); ok && p.Type == middleware.PrincipalTypePublisher {
		// Clé API média : l'identité est portée par le principal, pas par un
		// User.id. Le service vérifie le rattachement à la publication.
		return "", true
	}
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

// publisherID résout la publication depuis la clé API (contexte) ou le query
// param `publisherId` (JWT / dashboard).
func publisherID(r *http.Request) (string, bool) {
	if pid, ok := middleware.PublisherID(r.Context()); ok && pid != "" {
		return pid, true
	}
	if pid := r.URL.Query().Get("publisherId"); pid != "" {
		return pid, true
	}
	return "", false
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	pid, ok := publisherID(r)
	if !ok {
		response.BadRequest(w, "publisherId requis")
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
	PublisherID string   `json:"publisherId"`
	Name        string   `json:"name"`
	URL         string   `json:"url"`
	Events      []string `json:"events"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	var in createInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	// Nom, URL (https + anti-SSRF) et événements sont validés par le service :
	// une seule implémentation, valable pour tous les appelants.
	pid := in.PublisherID
	if pid == "" {
		if p, ok := publisherID(r); ok {
			pid = p
		}
	}
	if pid == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}

	wh, secret, err := h.svc.Create(r.Context(), userID, pid, in.Name, in.URL, in.Events)
	if err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.Created(w, map[string]any{"webhook": wh, "secret": secret})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	pid, ok := publisherID(r)
	if !ok {
		response.BadRequest(w, "publisherId requis")
		return
	}
	if err := h.svc.Delete(r.Context(), userID, id, pid); err != nil {
		h.writeWebhookError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) toggle(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	pid, ok := publisherID(r)
	if !ok {
		response.BadRequest(w, "publisherId requis")
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
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	pid, ok := publisherID(r)
	if !ok {
		response.BadRequest(w, "publisherId requis")
		return
	}
	res, err := h.svc.Test(r.Context(), userID, id, pid)
	if err != nil {
		if errors.Is(err, errNotFound) || errors.Is(err, errForbidden) ||
			errors.Is(err, errInvalidURL) || errors.Is(err, errInvalidInput) ||
			errors.Is(err, netguard.ErrUnsafeURL) {
			h.writeWebhookError(w, err)
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
	userID, ok := h.userID(w, r)
	if !ok {
		return
	}
	pid, ok := publisherID(r)
	if !ok {
		response.BadRequest(w, "publisherId requis")
		return
	}
	id := chi.URLParam(r, "id")
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), 50, 100)
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
	case errors.Is(err, errQuota):
		response.ErrorCode(w, http.StatusConflict, "webhook_quota", err.Error())
	case errors.Is(err, errInvalidURL), errors.Is(err, errInvalidInput), errors.Is(err, netguard.ErrUnsafeURL):
		response.BadRequest(w, err.Error())
	default:
		log.Printf("[webhooks] %v", err)
		response.Internal(w)
	}
}
