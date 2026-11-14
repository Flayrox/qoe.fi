package creator

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/anchors"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/shortcode"
	pkgslug "github.com/qoefi/api/internal/slug"
)

// creatorOwnsArticle vérifie le lien de propriété : publication de la clé,
// auteur, ou co-auteur.
func (h *Handler) creatorOwnsArticle(ctx context.Context, articleID, publisherID, userID string) bool {
	var n int
	err := h.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM "Article" a
		WHERE a.id = $1
		  AND (
		    a."publisherId" = $2
		    OR a."authorId"::text = $3
		    OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B"::text = $4)
		  )`,
		articleID, publisherID, userID, userID).Scan(&n)
	return err == nil && n > 0
}

// POST /v1/creator/articles — crée un BROUILLON lié au créateur.
// Réponse : la shape détail complète (contentHtml + contentMarkdown).
type apiArticleCreateInput struct {
	Title      string   `json:"title"`
	Content    string   `json:"content"` // HTML
	CategoryID string   `json:"categoryId"`
	Tags       []string `json:"tags"`
	IsPremium  bool     `json:"isPremium"`
}

func (h *Handler) apiArticleCreate(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	publisherID, _ := middleware.PublisherID(r.Context())

	var in apiArticleCreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	cleanTitle, err := antispam.SanitizeAndValidateText(in.Title, 1, 300, antispam.TextOptions{CheckXSS: true})
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	in.Title = cleanTitle
	if in.Content != "" {
		cleanContent, cerr := antispam.SanitizeAndValidateText(in.Content, 0, 500_000, antispam.TextOptions{AllowNewlines: true, CheckXSS: true})
		if cerr != nil {
			response.BadRequest(w, cerr.Error())
			return
		}
		in.Content = cleanContent
	}
	if len(in.Tags) > 10 {
		response.BadRequest(w, "trop de tags (max 10)")
		return
	}
	for i, tag := range in.Tags {
		cleanTag, terr := antispam.SanitizeAndValidateText(tag, 1, 50, antispam.TextOptions{CheckXSS: true})
		if terr != nil {
			response.BadRequest(w, terr.Error())
			return
		}
		in.Tags[i] = cleanTag
	}
	if in.CategoryID != "" {
		var ok bool
		if err := h.pool.QueryRow(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM "Category" WHERE id = $1 OR slug = $2)`,
			in.CategoryID, in.CategoryID).Scan(&ok); err != nil || !ok {
			response.BadRequest(w, "categoryId inconnue")
			return
		}
		// Résout le slug vers l'id si besoin.
		if err := h.pool.QueryRow(r.Context(),
			`SELECT id FROM "Category" WHERE id = $1 OR slug = $2`,
			in.CategoryID, in.CategoryID).Scan(&in.CategoryID); err != nil {
			response.BadRequest(w, "categoryId inconnue")
			return
		}
	}

	visibility := "PUBLIC"
	if in.IsPremium {
		visibility = "PAID_SUBSCRIBERS"
	}

	idPrefix := strings.ReplaceAll(slugify(in.Title), "-", "")
	if len(idPrefix) > 8 {
		idPrefix = idPrefix[:8]
	} else if idPrefix == "" {
		idPrefix = "art"
	}
	id := "api_" + idPrefix + "-" +
		strconv.FormatInt(time.Now().UnixNano()%100000, 10)
	shortCode := h.uniqueShortCode(r.Context())
	baseSlug := slugify(in.Title)
	if baseSlug == "" {
		baseSlug = "article"
	}
	if pkgslug.ExtractTrailingShortCode(baseSlug) == "" {
		baseSlug = baseSlug + "-" + shortCode
	}
	slug := h.uniqueArticleSlug(r.Context(), baseSlug)

	authorID := userID
	if authorID == "" {
		if p, ok := middleware.GetPrincipal(r.Context()); ok {
			if p.UserID != nil && *p.UserID != "" {
				authorID = *p.UserID
			} else if p.CreatedByUserID != nil && *p.CreatedByUserID != "" {
				authorID = *p.CreatedByUserID
			}
		}
	}
	if authorID == "" && publisherID != "" {
		_ = h.pool.QueryRow(r.Context(),
			`SELECT mm."userId"::text FROM "MediaMember" mm
			 JOIN "Media" m ON m.id = mm."mediaId"
			 WHERE m."publisherId" = $1 AND mm.role = 'owner' LIMIT 1`,
			publisherID).Scan(&authorID)
	}

	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	// L'index unique fait foi sur le code court : le pré-contrôle ne protège pas
	// d'une course entre deux créations. On régénère le code (et le suffixe du
	// slug) puis on rejoue l'insertion.
	var insertErr error
	for attempt := 0; attempt < 5; attempt++ {
		_, insertErr = h.pool.Exec(r.Context(), `
		INSERT INTO "Article" (id, title, slug, "shortCode", content, published, visibility,
		                       "readingTime", status, "isPremium", "semanticTags",
		                       "categoryId", "publisherId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, NULLIF($5,''), false, $6, $7, 'DRAFT', $8, $9,
		        NULLIF($10,''), NULLIF($11,''), $12, now(), now())`,
			id, in.Title, slug, shortCode, in.Content, visibility,
			readingTimeFromHTML(in.Content), in.IsPremium, tags,
			in.CategoryID, publisherID, authorID)
		if insertErr == nil || !shortcode.IsUniqueViolation(insertErr) {
			break
		}
		newCode := h.uniqueShortCode(r.Context())
		if strings.HasSuffix(slug, "-"+shortCode) {
			slug = strings.TrimSuffix(slug, "-"+shortCode) + "-" + newCode
		}
		shortCode = newCode
	}
	if insertErr != nil {
		log.Printf("[creator] article create: %v", insertErr)
		response.Internal(w)
		return
	}

	if h.asynq != nil {
		_ = queue.PublishSearchSync(h.asynq, queue.SearchSyncPayload{ArticleID: id, Action: "upsert"})
	}

	h.serveCreatorArticleByID(w, r, id)
}

// serveCreatorArticleByID rend la shape détail complète pour un id interne
// (création/édition) : contenu HTML + markdown, catégorie, auteurs, statut.
func (h *Handler) serveCreatorArticleByID(w http.ResponseWriter, r *http.Request, id string) {
	var full apiArticleFull
	full.Authors = []apiAuthor{}
	var createdAt time.Time
	var catID, catSlug, catName sql.NullString
	var tags []string

	err := h.pool.QueryRow(r.Context(), `
		SELECT a.id::text, a.slug, a.title, COALESCE(a.content,''), a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt",
		       a.status, a.published,
		       a."semanticTags", cat.id::text, cat.slug, cat.name
		FROM "Article" a
		LEFT JOIN "Category" cat ON cat.id = a."categoryId"
		WHERE a.id = $1`, id).Scan(
		&full.ID, &full.Slug, &full.Title, &full.ContentHTML, &full.CoverURL,
		&full.ReadingTime, &full.IsPremium, &createdAt,
		&full.Status, &full.Published,
		&tags, &catID, &catSlug, &catName)
	if err != nil {
		log.Printf("[creator] article by id %s: %v", id, err)
		response.Internal(w)
		return
	}
	full.PublishedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
	full.ContentMarkdown = htmlToMarkdown(full.ContentHTML)
	full.Excerpt = stripHTMLTags(full.ContentHTML, 180)
	full.Tags = func() []any {
		out := make([]any, len(tags))
		for i, v := range tags {
			out[i] = v
		}
		return out
	}()
	if catID.Valid {
		full.Category = &apiCategoryRef{ID: catID.String, Slug: catSlug.String, Name: catName.String}
	}
	h.resolveAuthors(r.Context(), map[string]int{full.ID: 0}, &full)

	callerID, _ := middleware.UserID(r.Context())
	baseSlug := full.Slug
	if callerID != "" && baseSlug != "" {
		full.Slug = h.effectiveSlug(r.Context(), full.ID, callerID, baseSlug)
		full.Authors = h.withEffectiveSlugs(r.Context(), full.ID, full.Authors, baseSlug)
	}

	response.OK(w, full)
}

// apiArticleUpdateInput : champs modifiables via PATCH (tous optionnels).
type apiArticleUpdateInput struct {
	Title      *string  `json:"title"`
	Content    *string  `json:"content"` // HTML
	CategoryID *string  `json:"categoryId"`
	Tags       []string `json:"tags"`
	IsPremium  *bool    `json:"isPremium"`
	Publish    *bool    `json:"publish"` // true → PUBLISHED, false → DRAFT
	RegenSlug  *bool    `json:"regenerateSlug"`
}

// PATCH /v1/creator/articles/{id} — met à jour un de SES articles.
func (h *Handler) apiArticleUpdate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	if !h.creatorOwnsArticle(r.Context(), id, publisherID, userID) {
		response.NotFound(w, "Article introuvable")
		return
	}

	var in apiArticleUpdateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	// Titre.
	if in.Title != nil && strings.TrimSpace(*in.Title) != "" {
		title, terr := antispam.SanitizeAndValidateText(*in.Title, 1, 300, antispam.TextOptions{CheckXSS: true})
		if terr != nil {
			response.BadRequest(w, terr.Error())
			return
		}
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET title = $2, "updatedAt" = now() WHERE id = $1`,
			id, title); err != nil {
			log.Printf("[creator] update title: %v", err)
			response.Internal(w)
			return
		}
		if in.RegenSlug != nil && *in.RegenSlug {
			var oldSlug, status string
			var published bool
			var shortCode sql.NullString
			_ = h.pool.QueryRow(r.Context(),
				`SELECT slug, published, status, "shortCode" FROM "Article" WHERE id = $1`, id).
				Scan(&oldSlug, &published, &status, &shortCode)

			base := slugify(title)
			if base == "" {
				base = "article"
			}
			if shortCode.Valid && shortCode.String != "" && pkgslug.ExtractTrailingShortCode(base) == "" {
				base = base + "-" + shortCode.String
			}
			newSlug := h.uniqueArticleSlug(r.Context(), base)
			if newSlug != oldSlug && oldSlug != "" {
				wasPublished := published || status == "PUBLISHED"
				if !wasPublished {
					_ = h.pool.QueryRow(r.Context(),
						`SELECT EXISTS(SELECT 1 FROM "ArticleSnapshot" WHERE "articleId" = $1 AND reason = 'PUBLISHED')`,
						id).Scan(&wasPublished)
				}
				if wasPublished {
					_, _ = h.pool.Exec(r.Context(),
						`INSERT INTO "ArticleSlugHistory" (id, "articleId", slug) VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT (slug) DO NOTHING`,
						id, oldSlug)
				}
			}
			_, _ = h.pool.Exec(r.Context(),
				`UPDATE "Article" SET slug = $2, "updatedAt" = now() WHERE id = $1`, id, newSlug)
		}
	}
	// Contenu (+ temps de lecture recalculé).
	if in.Content != nil {
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET content = $2, "readingTime" = $3, "updatedAt" = now() WHERE id = $1`,
			id, *in.Content, readingTimeFromHTML(*in.Content)); err != nil {
			log.Printf("[creator] update content: %v", err)
			response.Internal(w)
			return
		}
		// Le contenu a changé → les offsets canoniques des surlignages peuvent
		// être périmés : passe de ré-ancrage (jamais bloquante).
		anchors.ReanchorArticle(r.Context(), h.pool, id)
	}
	// Catégorie (id ou slug ; vide = retirer).
	if in.CategoryID != nil {
		catID := sql.NullString{}
		if *in.CategoryID != "" {
			if err := h.pool.QueryRow(r.Context(),
				`SELECT id FROM "Category" WHERE id = $1 OR slug = $1`,
				*in.CategoryID).Scan(&catID); err != nil {
				response.BadRequest(w, "categoryId inconnue")
				return
			}
		}
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET "categoryId" = NULLIF($2,''), "updatedAt" = now() WHERE id = $1`,
			id, catID.String); err != nil {
			log.Printf("[creator] update category: %v", err)
			response.Internal(w)
			return
		}
	}
	// Tags.
	if in.Tags != nil {
		tags := in.Tags
		if tags == nil || len(tags) == 0 {
			tags = []string{}
		}
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET "semanticTags" = $2, "updatedAt" = now() WHERE id = $1`,
			id, tags); err != nil {
			log.Printf("[creator] update tags: %v", err)
			response.Internal(w)
			return
		}
	}
	// Premium → visibilité alignée.
	if in.IsPremium != nil {
		vis := "PUBLIC"
		if *in.IsPremium {
			vis = "PAID_SUBSCRIBERS"
		}
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET "isPremium" = $2, visibility = $3, "updatedAt" = now() WHERE id = $1 AND status <> 'PUBLISHED'`,
			id, *in.IsPremium, vis); err != nil {
			log.Printf("[creator] update premium: %v", err)
			response.Internal(w)
			return
		}
	}
	// Publication / dépublication.
	if in.Publish != nil {
		if *in.Publish {
			if _, err := h.pool.Exec(r.Context(),
				`UPDATE "Article" SET published = true, status = 'PUBLISHED', "updatedAt" = now()
				 WHERE id = $1 AND COALESCE(content,'') <> ''`, id); err != nil {
				log.Printf("[creator] publish: %v", err)
				response.Internal(w)
				return
			}
			// Publication → dernière passe de ré-ancrage avant exposition + les
			// annotations officielles du studio deviennent des entités ancrées
			// (l'auteur est lu en base — correct en co-écriture).
			anchors.ReanchorArticle(r.Context(), h.pool, id)
			anchors.SyncOfficialMarks(r.Context(), h.pool, id)
		} else if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET published = false, status = 'DRAFT', "updatedAt" = now() WHERE id = $1`,
			id); err != nil {
			log.Printf("[creator] unpublish: %v", err)
			response.Internal(w)
			return
		}
	}

	if h.asynq != nil {
		_ = queue.PublishSearchSync(h.asynq, queue.SearchSyncPayload{ArticleID: id, Action: "upsert"})
	}

	h.serveCreatorArticleByID(w, r, id)
}

// DELETE /v1/creator/articles/{id} — supprime définitivement un de SES articles.
func (h *Handler) apiArticleDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	tag, err := h.pool.Exec(r.Context(), `
		DELETE FROM "Article" a
		WHERE a.id = $1 AND (
		  a."authorId"::text = $2
		  OR a."publisherId" = $3
		  OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B"::text = $2)
		)`,
		id, userID, publisherID)
	if err != nil {
		log.Printf("[creator] article delete: %v", err)
		response.Internal(w)
		return
	}
	if tag.RowsAffected() == 0 {
		response.NotFound(w, "Article introuvable")
		return
	}

	if h.asynq != nil {
		_ = queue.PublishSearchSync(h.asynq, queue.SearchSyncPayload{ArticleID: id, Action: "delete"})
	}

	response.OK(w, map[string]bool{"deleted": true})
}
