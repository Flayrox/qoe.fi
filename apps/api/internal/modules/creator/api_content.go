package creator

import (
	"context"
	"database/sql"
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

type apiCategoryRef struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type apiArticleSummary struct {
	Category    *apiCategoryRef `json:"category,omitempty"`
	ID          string          `json:"id"`
	Slug        string          `json:"slug"`
	Title       string          `json:"title"`
	Excerpt     string          `json:"excerpt"`
	CoverURL    *string         `json:"coverImageUrl"`
	ReadingTime int32           `json:"readingTime"`
	IsPremium   bool            `json:"isPremium"`
	PublishedAt string          `json:"publishedAt"`
	Authors     []apiAuthor     `json:"authors"`
}

type apiArticlesPage struct {
	Items      []apiArticleSummary `json:"items"`
	NextCursor string              `json:"nextCursor"`
	HasMore    bool                `json:"hasMore"`
}

type apiArticleFull struct {
	apiArticleSummary
	ContentHTML     string `json:"contentHtml"`
	ContentMarkdown string `json:"contentMarkdown"`
	Tags            []any  `json:"tags"`
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

// apiArticlesFrom : source des articles liés au créateur, catégorie
// jointe pour le filtrage et l'enrichissement. $1 publication de la clé,
// $2 userId (signature), $3 co-écriture.
const apiArticlesFrom = `
	FROM "Article" a
	LEFT JOIN "Category" cat ON cat.id = a."categoryId"
	WHERE a.published = true
	  AND a.status = 'PUBLISHED'
	  AND (
	    a."publicationId" = $1
	    OR a."authorId"::text = $2
	    OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B" = $3)
	  )`

var apiArticlesSorts = map[string]string{
	"published_desc": `a."createdAt" DESC`,
	"published_asc":  `a."createdAt" ASC`,
	"title_asc":      `a.title ASC`,
	"title_desc":     `a.title DESC`,
}

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

// ─── GET /v1/creator/categories ────────────────────────────────────────

// apiCategoryItem : rubrique de la publication avec son volume d'articles
// publiés — la table des matières du CMS.
type apiCategoryItem struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
	ArticleCount int     `json:"articleCount"`
}

func (h *Handler) apiCategories(w http.ResponseWriter, r *http.Request) {
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	items := []apiCategoryItem{}
	rows, err := h.pool.Query(r.Context(), `
		SELECT c.id::text, c.slug, c.name, c.description,
		       COUNT(a.id)::int AS article_count
		FROM "Category" c
		LEFT JOIN "Article" a
		  ON a."categoryId" = c.id AND a.published = true AND a.status = 'PUBLISHED'
		WHERE c."publicationId" = $1
		   OR c."publicationId" IN (
		     SELECT DISTINCT a2."publicationId" FROM "Article" a2
		     WHERE a2."authorId"::text = $2 AND a2.published = true
		   )
		GROUP BY c.id, c.slug, c.name, c.description
		ORDER BY c.name ASC`, publicationID, userID)
	if err != nil {
		log.Printf("[creator] api categories: %v", err)
		response.Internal(w)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var it apiCategoryItem
		if err := rows.Scan(&it.ID, &it.Slug, &it.Name, &it.Description, &it.ArticleCount); err != nil {
			continue
		}
		items = append(items, it)
	}
	response.OK(w, map[string]any{"categories": items})
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

	q := r.URL.Query()
	limit, offset := parseLimitCursor(r)

	// ── Filtres CMS : catégorie, tag, premium, recherche, dates ──
	where := apiArticlesFrom
	args := []any{publicationID, userID, userID}
	add := func(fragment string, v ...any) {
		args = append(args, v...)
		where += strings.ReplaceAll(fragment, "$?", "$"+strconv.Itoa(len(args)))
	}
	if cat := q.Get("category"); cat != "" {
		add(` AND cat.slug = $?`, cat)
	}
	if tag := q.Get("tag"); tag != "" {
		add(` AND a."semanticTags" @> ARRAY[$?]::text[]`, tag)
	}
	switch q.Get("premium") {
	case "true":
		add(` AND a."isPremium" = true`)
	case "false":
		add(` AND a."isPremium" = false`)
	}
	if term := q.Get("q"); term != "" {
		add(` AND a.title ILIKE '%' || $? || '%'`, term)
	}
	for param, cond := range map[string]string{
		"since": ` AND a."createdAt" >= $?::date`,
		"until": ` AND a."createdAt" < ($?::date + INTERVAL '1 day')`,
	} {
		if v := q.Get(param); v != "" {
			add(cond, v)
		}
	}

	order, ok := apiArticlesSorts[q.Get("sort")]
	if !ok {
		order = apiArticlesSorts["published_desc"]
	}

	page := apiArticlesPage{Items: []apiArticleSummary{}}
	rows, err := h.pool.Query(r.Context(), `
		SELECT a.id::text, a.slug, a.title, a.content, a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt",
		       cat.id::text, cat.slug, cat.name
		`+where+`
		ORDER BY `+order+`
		LIMIT $`+strconv.Itoa(len(args)+1)+` OFFSET $`+strconv.Itoa(len(args)+2),
		append(args, limit+1, offset)...)
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
		var catID, catSlug, catName sql.NullString
		if err := rows.Scan(&it.ID, &it.Slug, &it.Title, &content, &it.CoverURL,
			&it.ReadingTime, &it.IsPremium, &publishedAt,
			&catID, &catSlug, &catName); err != nil {
			log.Printf("[creator] articles scan: %v", err)
			continue
		}
		it.PublishedAt = publishedAt.Format("2006-01-02T15:04:05Z07:00")
		it.Excerpt = stripHTMLTags(content, 180)
		it.Authors = []apiAuthor{}
		if catID.Valid {
			it.Category = &apiCategoryRef{ID: catID.String, Slug: catSlug.String, Name: catName.String}
		}
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
	var catID, catSlug, catName sql.NullString
	err := h.pool.QueryRow(r.Context(), `
		SELECT a.id::text, a.slug, a.title, a.content, a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt",
		       a."semanticTags", cat.id::text, cat.slug, cat.name
		`+apiArticlesFrom+` AND a.slug = $4
		LIMIT 1`,
		publicationID, userID, userID, slug).Scan(
		&full.ID, &full.Slug, &full.Title, &full.ContentHTML, &full.CoverURL,
		&full.ReadingTime, &full.IsPremium, &publishedAt, &tags,
		&catID, &catSlug, &catName)
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
	if catID.Valid {
		full.Category = &apiCategoryRef{ID: catID.String, Slug: catSlug.String, Name: catName.String}
	}
	full.ContentMarkdown = htmlToMarkdown(full.ContentHTML)
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
