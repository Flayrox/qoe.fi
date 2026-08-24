package publications

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose la lecture publique des publications tenant.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterPublic enregistre les routes (auth optionnelle : le viewer est lu
// du JWT pour les entitlements/interactions).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/publications/by-domain/{domain}", h.byDomain)
	r.Get("/v1/publications/by-domain/{domain}/article/{slug}", h.article)
}

func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Publication ou article introuvable.")
	default:
		log.Printf("[publications] %v", err)
		response.Internal(w)
	}
}

// GET /v1/publications/by-domain/{domain} — publication + nav + socials +
// catégories + articles publiés.
func (h *Handler) byDomain(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	if strings.TrimSpace(domain) == "" {
		response.BadRequest(w, "domaine requis")
		return
	}
	pub, err := h.svc.ByDomain(r.Context(), domain)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, pub)
}

// GET /v1/publications/by-domain/{domain}/article/{slug} — article (avec
// catégorie + auteur + entitlements + interactions du viewer).
func (h *Handler) article(w http.ResponseWriter, r *http.Request) {
	domain := chi.URLParam(r, "domain")
	slug := chi.URLParam(r, "slug")
	if strings.TrimSpace(domain) == "" || strings.TrimSpace(slug) == "" {
		response.BadRequest(w, "domaine et slug requis")
		return
	}
	viewerID, _ := middleware.UserID(r.Context())
	viewerEmail := ""
	// Le viewer email n'est pas exposé par le middleware — les entitlements
	// sont résolus via userId (suffisant pour le parcours tenant).
	bundle, err := h.svc.Article(r.Context(), domain, slug, viewerID, viewerEmail)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, bundle)
}
