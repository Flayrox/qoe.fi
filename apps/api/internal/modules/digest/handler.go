// Routes digest — configuration et aperçu.
package digest

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler porte le digest.
type Handler struct {
	svc *Service
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterProtected monte les routes (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/creator/newsletter/digest", h.get)
	r.Put("/v1/creator/newsletter/digest", h.put)
	r.Post("/v1/creator/newsletter/digest/preview", h.preview)
}

func (h *Handler) publisherGuard(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return "", false
	}
	allowed, err := h.svc.CanManagePublisher(r.Context(), userID, publisherID)
	if err != nil {
		response.Internal(w)
		return "", false
	}
	if !allowed {
		response.Forbidden(w, "publication non autorisée")
		return "", false
	}
	return publisherID, true
}

// GET — configuration courante.
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	publisherID, ok := h.publisherGuard(w, r)
	if !ok {
		return
	}
	cfg, err := h.svc.GetConfig(r.Context(), publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"config": cfg})
}

// PUT — enregistre la configuration.
func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	publisherID, ok := h.publisherGuard(w, r)
	if !ok {
		return
	}
	var cfg Config
	if !response.DecodeJSON(w, r, &cfg) {
		return
	}
	saved, err := h.svc.SaveConfig(r.Context(), publisherID, cfg)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"config": saved})
}

// POST — aperçu du prochain envoi (aucun email n'est envoyé).
func (h *Handler) preview(w http.ResponseWriter, r *http.Request) {
	publisherID, ok := h.publisherGuard(w, r)
	if !ok {
		return
	}
	cfg, err := h.svc.GetConfig(r.Context(), publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	articles, err := h.svc.RecentArticles(r.Context(), publisherID, cfg.MaxArticles)
	if err != nil {
		response.Internal(w)
		return
	}
	name := h.svc.PublisherName(r.Context(), publisherID)
	html := RenderPreview(name, cfg, articles, requestOrigin(r))
	response.OK(w, map[string]any{
		"subject":  Subject(name, articles),
		"html":     html,
		"count":    len(articles),
		"articles": articles,
	})
}

// requestOrigin reconstruit l'origine publique pour les liens de l'aperçu.
// Les domaines locaux restent en http ; le reste en https.
func requestOrigin(r *http.Request) string {
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	scheme := "https"
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.") ||
		strings.HasSuffix(host, ".test") || strings.HasSuffix(host, ".local") {
		scheme = "http"
	}
	return scheme + "://" + host
}
