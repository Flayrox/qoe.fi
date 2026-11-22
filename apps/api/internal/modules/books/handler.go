// Route de compilation — POST /v1/creator/books/compile.
package books

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler porte la compilation de livres.
type Handler struct {
	svc *Service
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterProtected monte la route (groupe authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/creator/books/compile", h.compile)
}

type compileInput struct {
	Title      string   `json:"title"`
	Author     string   `json:"author"`
	ArticleIDs []string `json:"articleIds"`
}

// POST /v1/creator/books/compile — renvoie un EPUB (application/epub+zip).
func (h *Handler) compile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}

	var in compileInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Title) == "" {
		response.BadRequest(w, "titre requis")
		return
	}

	// Dédoublonnage en conservant l'ordre demandé (les ids viennent du front).
	ordered := make([]string, 0, len(in.ArticleIDs))
	seen := make(map[string]bool, len(in.ArticleIDs))
	for _, id := range in.ArticleIDs {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ordered = append(ordered, id)
	}
	if len(ordered) == 0 {
		response.BadRequest(w, "au moins un article requis")
		return
	}
	if len(ordered) > 80 {
		response.BadRequest(w, "80 articles maximum par livre")
		return
	}

	articles, err := h.svc.Articles(r.Context(), ordered)
	if err != nil {
		log.Printf("[books] articles: %v", err)
		response.Internal(w)
		return
	}
	if len(articles) != len(ordered) {
		response.NotFound(w, "un ou plusieurs articles sont introuvables")
		return
	}

	// Tous les articles doivent appartenir à des publications gérées.
	publishers := map[string]bool{}
	for _, article := range articles {
		publishers[article.PublisherID] = true
	}
	for publisherID := range publishers {
		ok, err := h.svc.CanManagePublisher(r.Context(), userID, publisherID)
		if err != nil {
			log.Printf("[books] accès publication: %v", err)
			response.Internal(w)
			return
		}
		if !ok {
			response.Forbidden(w, "publication non autorisée")
			return
		}
	}

	byID := make(map[string]ArticleRow, len(articles))
	for _, article := range articles {
		byID[article.ID] = article
	}
	chapters := make([]Chapter, 0, len(ordered))
	for _, id := range ordered {
		article := byID[id]
		chapters = append(chapters, Chapter{Title: article.Title, HTML: article.Content})
	}

	author := strings.TrimSpace(in.Author)
	if author == "" && len(publishers) == 1 {
		for publisherID := range publishers {
			author = h.svc.PublisherLabel(r.Context(), publisherID)
		}
	}

	data, err := BuildEPUB(in.Title, author, chapters, time.Now())
	if err != nil {
		log.Printf("[books] epub: %v", err)
		response.Internal(w)
		return
	}

	w.Header().Set("Content-Type", "application/epub+zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s.epub"`, bookFileName(in.Title)))
	w.Header().Set("Cache-Control", "no-store")
	if _, err := w.Write(data); err != nil {
		log.Printf("[books] write: %v", err)
	}
}

// bookFileName normalise le titre pour le nom de fichier.
func bookFileName(title string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(title) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_':
			// Un seul tiret : « 2026 : mon » ne doit pas donner `2026--mon`.
			if !lastDash && b.Len() > 0 {
				b.WriteRune('-')
			}
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "livre"
	}
	if len(out) > 60 {
		return out[:60]
	}
	return out
}
