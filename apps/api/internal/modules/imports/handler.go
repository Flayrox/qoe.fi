package imports

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(r chi.Router) {
	r.Post("/v1/import/articles", h.importArticles)
}

// POST /v1/import/articles — crée les articles d'un lot (dédup par slug).
// Corps : { publicationId, articles: [{title, slug, content, readingTime}] }.
func (h *Handler) importArticles(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	var in ImportArticlesRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || len(in.Articles) == 0 {
		response.BadRequest(w, "publicationId et articles requis")
		return
	}
	created, err := h.svc.ImportArticles(r.Context(), userID, in)
	if err != nil {
		if err == errForbidden {
			response.Forbidden(w, "Vous n'êtes pas autorisé à importer dans cette publication.")
			return
		}
		log.Printf("[imports] importArticles: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, map[string]int{"importedCount": created})
}
