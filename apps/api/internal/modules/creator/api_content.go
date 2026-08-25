package creator

import (
	"context"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// =====================================================================
// 🎨 API créateur v2 — contenu prêt à consommer par un front personnalisé.
// Toutes les routes sont montées derrière APIKeyAuth (scope READ) et
// renvoient du JSON simple : profil, articles (liste + détail HTML),
// surlignages filtrables par article.
// =====================================================================

var tagStripper = regexp.MustCompile(`<[^>]*>`)

// stripHTMLTags extrait un extrait texte brut d'un contenu HTML stocké.
func stripHTMLTags(html string, max int) string {
	text := strings.Join(strings.Fields(tagStripper.ReplaceAllString(html, " ")), " ")
	if len(text) > max {
		cut := text[:max]
		if idx := strings.LastIndex(cut, " "); idx > 0 {
			cut = cut[:idx]
		}
		text = cut + "…"
	}
	return text
}

type apiAuthor struct {
	ID       string  `json:"id"`
	Username *string `json:"username"`
	Name     *string `json:"name"`
}

type apiArticleSummary struct {
	ID          string      `json:"id"`
	Slug        string      `json:"slug"`
	Title       string      `json:"title"`
	Excerpt     string      `json:"excerpt"`
	CoverURL    *string     `json:"coverImageUrl"`
	ReadingTime int32       `json:"readingTime"`
	IsPremium   bool        `json:"isPremium"`
	PublishedAt string      `json:"publishedAt"`
	Authors     []apiAuthor `json:"authors"`
}

type apiArticlesPage struct {
	Items      []apiArticleSummary `json:"items"`
	NextCursor string              `json:"nextCursor"`
	HasMore    bool                `json:"hasMore"`
}

type apiArticleFull struct {
	apiArticleSummary
	ContentHTML string `json:"contentHtml"`
	Tags        []any  `json:"tags"`
}

// ─── GET /v1/creator/me ────────────────────────────────────────────────

// apiMe agrège l'identité de la clé : publication portée + scopes effectifs.
type apiMe struct {
	Publication struct {
		ID           string  `json:"id"`
		Name         string  `json:"name"`
		Slug         string  `json:"slug"`
		LogoURL      *string `json:"logoUrl"`
		HeroText     *string `json:"heroText"`
		Subdomain    *string `json:"subdomain"`
		CustomDomain *string `json:"customDomain"`
	} `json:"publication"`
	UserID string   `json:"userId"`
	Scopes []string `json:"scopes"`
}

func (h *Handler) apiMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pubID, _ := middleware.PublicationID(r.Context())

	var m apiMe
	m.UserID = userID
	if scopes, ok := middleware.Scopes(r.Context()); ok {
		m.Scopes = scopes
	} else {
		m.Scopes = middleware.AllScopes
	}

	err := h.pool.QueryRow(r.Context(), `
		SELECT id::text, name, slug, "logoUrl", "heroText", subdomain, "customDomain"
		FROM "Publication" WHERE id = $1`,
		pubID).Scan(&m.Publication.ID, &m.Publication.Name, &m.Publication.Slug,
		&m.Publication.LogoURL, &m.Publication.HeroText,
		&m.Publication.Subdomain, &m.Publication.CustomDomain)
	if err != nil {
		log.Printf("[creator] api me: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, m)
}

// ─── Articles ──────────────────────────────────────────────────────────

const apiArticlesWhere = `
	FROM "Article" a
	WHERE a.published = true
	  AND a.status = 'PUBLISHED'
	  AND (
	    a."publicationId" = $1
	    OR a."authorId"::text = $2
	    OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B" = $3)
	  )`

func (h *Handler) resolveAuthors(ctx context.Context, articleIDs map[string]int, items byAuthorSetter) {
	ids := make([]string, 0, len(articleIDs))
	for id := range articleIDs {
		ids = append(ids, id)
	}
	q := `
		SELECT a.id::text, a."authorId"::text, u.username, u.name, u.id::text
		FROM "Article" a JOIN "User" u ON u.id = a."authorId"
		WHERE a.id = ANY($1::text[])
		UNION ALL
		SELECT c."A", '', u.username, u.name, u.id::text
		FROM "_CoAuthors" c JOIN "User" u ON u.id = c."B"
		WHERE c."A" = ANY($1::text[])`
	rows, err := h.pool.Query(ctx, q, ids)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var scanArticleID, mainAuthorID, userID string
		var username, name *string
		if err := rows.Scan(&scanArticleID, &mainAuthorID, &username, &name, &userID); err != nil {
			continue
		}
		idx, ok := articleIDs[scanArticleID]
		if ok {
			items.setAuthor(idx, apiAuthor{ID: userID, Username: username, Name: name})
		}
	}
}

// setter minimal pour partager la résolution d'auteurs entre les deux shapes.
type byAuthorSetter interface {
	setAuthor(index int, a apiAuthor)
}

func (p *apiArticlesPage) setAuthor(index int, a apiAuthor) {
	p.Items[index].Authors = append(p.Items[index].Authors, a)
}

func (h *Handler) apiArticles(w http.ResponseWriter, r *http.Request) {
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	page := apiArticlesPage{Items: []apiArticleSummary{}}
	rows, err := h.pool.Query(r.Context(), `
		SELECT a.id::text, a.slug, a.title, a.content, a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt"
		`+apiArticlesWhere+`
		ORDER BY a."createdAt" DESC
		LIMIT $4 OFFSET $5`,
		publicationID, userID, userID, limit+1, offset)
	if err != nil {
		log.Printf("[creator] api articles: %v", err)
		response.Internal(w)
		return
	}
	defer rows.Close()

	ids := map[string]int{}
	for rows.Next() {
		var it apiArticleSummary
		var content string
		var publishedAt time.Time
		if err := rows.Scan(&it.ID, &it.Slug, &it.Title, &content, &it.CoverURL,
			&it.ReadingTime, &it.IsPremium, &publishedAt); err != nil {
			log.Printf("[creator] articles scan: %v", err)
			continue
		}
		it.PublishedAt = publishedAt.Format("2006-01-02T15:04:05Z07:00")
		it.Excerpt = stripHTMLTags(content, 180)
		it.Authors = []apiAuthor{}
		ids[it.ID] = len(page.Items)
		page.Items = append(page.Items, it)
	}
	rows.Close()

	h.resolveAuthors(r.Context(), ids, &page)

	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		page.HasMore = true
		page.NextCursor = strconv.Itoa(offset + limit)
	}
	response.OK(w, page)
}

// GET /v1/creator/articles/{slug} — article complet (contenu HTML).
func (h *Handler) apiArticleBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	var full apiArticleFull
	full.Authors = []apiAuthor{}
	var publishedAt time.Time
	var tags []string
	err := h.pool.QueryRow(r.Context(), `
		SELECT a.id::text, a.slug, a.title, a.content, a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt",
		       a."semanticTags"
		`+apiArticlesWhere+` AND a.slug = $4
		LIMIT 1`,
		publicationID, userID, userID, slug).Scan(
		&full.ID, &full.Slug, &full.Title, &full.ContentHTML, &full.CoverURL,
		&full.ReadingTime, &full.IsPremium, &publishedAt, &tags)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[creator] api article by slug: %v", err)
		response.Internal(w)
		return
	}
	full.PublishedAt = publishedAt.Format("2006-01-02T15:04:05Z07:00")
	full.Tags = func() []any {
		out := make([]any, len(tags))
		for i, v := range tags {
			out[i] = v
		}
		return out
	}()
	full.Excerpt = stripHTMLTags(full.ContentHTML, 180)

	ids := map[string]int{full.ID: 0}
	h.resolveAuthors(r.Context(), ids, &full)
	response.OK(w, full)
}

// setAuthor pour la shape complète (embarque apiArticleSummary).
func (a *apiArticleFull) setAuthor(index int, author apiAuthor) {
	a.Authors = append(a.Authors, author)
}

// ─── Filtre highlights par article ─────────────────────────────────────

// GET /v1/creator/highlights?article=slug délègue au handler existant avec
// le filtre ajouté dans apiHighlightsPageQuery.
func parseCursor(r *http.Request) (int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
