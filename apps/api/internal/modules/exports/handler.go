// Route d'export — une archive ZIP, en lecture seule.
package exports

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler porte l'export créateur.
type Handler struct {
	svc *Service
}

// NewHandler construit le handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterProtected monte la route (groupe déjà authentifié).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Get("/v1/creator/export", h.export)
}

// GET /v1/creator/export?publisherId=… — archive complète de la publication.
func (h *Handler) export(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}

	allowed, err := h.svc.CanManagePublisher(r.Context(), userID, publisherID)
	if err != nil {
		response.Internal(w)
		return
	}
	if !allowed {
		response.Forbidden(w, "publication non autorisée")
		return
	}

	articles, err := h.svc.Articles(r.Context(), publisherID)
	if err != nil {
		log.Printf("[exports] articles: %v", err)
		response.Internal(w)
		return
	}
	subscribers, err := h.svc.Subscribers(r.Context(), publisherID)
	if err != nil {
		log.Printf("[exports] subscribers: %v", err)
		response.Internal(w)
		return
	}
	name := h.svc.PublisherName(r.Context(), publisherID)
	fileName := SafeFileName(name)
	if fileName == "article" {
		fileName = SafeFileName(publisherID)
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="qoe-export-%s.zip"`, fileName))
	w.Header().Set("Cache-Control", "no-store")

	zw := zip.NewWriter(w)
	defer func() {
		if err := zw.Close(); err != nil {
			log.Printf("[exports] close zip: %v", err)
		}
	}()

	writeFile := func(path string, data []byte) {
		file, err := zw.Create(path)
		if err != nil {
			log.Printf("[exports] create %s: %v", path, err)
			return
		}
		if _, err := file.Write(data); err != nil {
			log.Printf("[exports] write %s: %v", path, err)
		}
	}

	for index, article := range articles {
		base := fmt.Sprintf("articles/%03d-%s", index+1, SafeFileName(article.Slug))
		frontMatter := fmt.Sprintf(
			"---\ntitle: %s\nslug: %s\nstatus: %s\ncreatedAt: %s\nupdatedAt: %s\n---\n\n",
			strconv.Quote(article.Title),
			strconv.Quote(article.Slug),
			strconv.Quote(article.Status),
			article.CreatedAt.UTC().Format(time.RFC3339),
			article.UpdatedAt.UTC().Format(time.RFC3339),
		)
		writeFile(base+".md", []byte(frontMatter+HTMLToMarkdown(article.Content)))
		// Le HTML d'origine est conservé tel quel : aucune perte possible.
		writeFile(base+".html", []byte(article.Content))
	}

	var csvBuffer bytes.Buffer
	writer := csv.NewWriter(&csvBuffer)
	_ = writer.Write([]string{"email", "status", "active", "premium", "ltv_cents", "created_at"})
	for _, subscriber := range subscribers {
		_ = writer.Write([]string{
			subscriber.Email,
			subscriber.Status,
			strconv.FormatBool(subscriber.Active),
			strconv.FormatBool(subscriber.Premium),
			strconv.Itoa(subscriber.LtvCents),
			subscriber.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	writer.Flush()
	writeFile("subscribers.csv", csvBuffer.Bytes())

	manifest := map[string]any{
		"format":      "qoe.fi/export/1",
		"exportedAt":  time.Now().UTC().Format(time.RFC3339),
		"publisher":   name,
		"publisherId": publisherID,
		"articles":    len(articles),
		"subscribers": len(subscribers),
		"contents": map[string]string{
			"articles":    "articles/*.md + *.html (Markdown dérivé, HTML d'origine)",
			"subscribers": "subscribers.csv",
		},
	}
	manifestJSON, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		log.Printf("[exports] manifest: %v", err)
		return
	}
	writeFile("manifest.json", manifestJSON)
}
