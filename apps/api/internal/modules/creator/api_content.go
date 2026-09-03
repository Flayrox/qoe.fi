package creator

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/anchors"
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
	// Slug effectif de CET auteur pour l'article (variant personnel ou
	// slug principal) — permet d'ouvrir la version de l'autre auteur.
	Slug string `json:"slug"`
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
	Status    string `json:"status"` // DRAFT | PUBLISHED
	Published bool   `json:"published"`
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
	WHERE (
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
		for _, val := range v {
			args = append(args, val)
			fragment = strings.Replace(fragment, "$?", "$"+strconv.Itoa(len(args)), 1)
		}
		where += fragment
	}
	if cat := q.Get("category"); cat != "" {
		add(` AND (cat.slug = $? OR cat.id = $?)`, cat, cat)
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
	// Status filter: draft, published (default), all
	switch q.Get("status") {
	case "draft":
		add(` AND a.status = 'DRAFT'`)
	case "all":
		// no filter
	default:
		add(` AND a.published = true AND a.status = 'PUBLISHED'`)
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
	for i := range page.Items {
		page.Items[i].Authors = h.withEffectiveSlugs(
			r.Context(), page.Items[i].ID, page.Items[i].Authors, page.Items[i].Slug,
		)
	}

	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		page.HasMore = true
		page.NextCursor = strconv.Itoa(offset + limit)
	}

	var total int
	if err := h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*)::int `+where, args...).Scan(&total); err == nil {
		w.Header().Set("X-Total-Count", strconv.Itoa(total))
	}
	payload := map[string]any{
		"items":      page.Items,
		"total":      total,
		"hasMore":    page.HasMore,
		"nextCursor": page.NextCursor,
	}
	response.OK(w, payload)
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
		`+apiArticlesFrom+` AND (a.slug = $4
		   OR EXISTS (SELECT 1 FROM "ArticleSlug" s WHERE s.slug = $4 AND s."articleId" = a.id)
		   OR EXISTS (SELECT 1 FROM "ArticleSlugHistory" h WHERE h.slug = $4 AND h."articleId" = a.id))
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

	// Le slug affiché = celui de l'appelant (variant personnel si défini).
	callerID, _ := middleware.UserID(r.Context())
	baseSlug := full.Slug
	full.Slug = h.effectiveSlug(r.Context(), full.ID, callerID, baseSlug)

	ids := map[string]int{full.ID: 0}
	h.resolveAuthors(r.Context(), ids, &full)
	full.Authors = h.withEffectiveSlugs(r.Context(), full.ID, full.Authors, baseSlug)
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

// =====================================================================
// ✍️ Écriture (scope WRITE) — créer / modifier / supprimer ses articles
// depuis des outils externes. Le créateur ne touche qu'à SES articles :
// publication de la clé, signature ou co-écriture.
// =====================================================================

var slugSanitizer = regexp.MustCompile(`[^a-z0-9]+`)
var slugValidRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// slugify transforme un titre en slug URL ASCII.
func slugify(title string) string {
	s := strings.ToLower(strings.TrimSpace(title))
	s = strings.NewReplacer(
		"à", "a", "â", "a", "ä", "a", "é", "e", "è", "e", "ê", "e", "ë", "e",
		"î", "i", "ï", "i", "ô", "o", "ö", "o", "ù", "u", "û", "u", "ü", "u",
		"ç", "c", "œ", "oe",
	).Replace(s)
	s = slugSanitizer.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// uniqueArticleSlug garantit un slug libre (suffixe -2, -3… sinon hash court).
func (h *Handler) uniqueArticleSlug(ctx context.Context, base string) string {
	if base == "" {
		base = "article"
	}
	candidate := base
	for i := 2; ; i++ {
		var exists bool
		if err := h.pool.QueryRow(ctx,
			`SELECT EXISTS(
			   SELECT 1 FROM "Article" WHERE slug = $1
			   UNION ALL SELECT 1 FROM "ArticleSlug" WHERE slug = $1
			   UNION ALL SELECT 1 FROM "ArticleSlugHistory" WHERE slug = $1
			 )`, candidate,
		).Scan(&exists); err != nil || !exists {
			return candidate
		}
		candidate = base + "-" + strconv.Itoa(i)
	}
}

// creatorOwnsArticle vérifie le lien de propriété : publication de la clé,
// auteur, ou co-auteur.
func (h *Handler) creatorOwnsArticle(ctx context.Context, articleID, publicationID, userID string) bool {
	var n int
	err := h.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM "Article" a
		WHERE a.id = $1
		  AND (
		    a."publicationId" = $2
		    OR a."authorId"::text = $3
		    OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B"::text = $4)
		  )`,
		articleID, publicationID, userID, userID).Scan(&n)
	return err == nil && n > 0
}

// readingTimeFromHTML estime le temps de lecture (~200 mots/min).
func readingTimeFromHTML(html string) int32 {
	text := stripHTMLTags(html, 1<<20)
	words := len(strings.Fields(text))
	if words == 0 {
		return 1
	}
	rt := int32((words + 199) / 200)
	if rt < 1 {
		rt = 1
	}
	return rt
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
	publicationID, _ := middleware.PublicationID(r.Context())

	var in apiArticleCreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		response.BadRequest(w, "title requis")
		return
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

	id := "api_" + strings.ReplaceAll(slugify(in.Title), "-", "")[:8] + "-" +
		strconv.FormatInt(time.Now().UnixNano()%100000, 10)
	slug := h.uniqueArticleSlug(r.Context(), slugify(in.Title))

	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	if _, err := h.pool.Exec(r.Context(), `
		INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                       "readingTime", status, "isPremium", "semanticTags",
		                       "categoryId", "publicationId", "authorId", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, NULLIF($4,''), false, $5, $6, 'DRAFT', $7, $8,
		        NULLIF($9,''), NULLIF($10,''), $11, now(), now())`,
		id, in.Title, slug, in.Content, visibility,
		readingTimeFromHTML(in.Content), in.IsPremium, tags,
		in.CategoryID, publicationID, userID); err != nil {
		log.Printf("[creator] article create: %v", err)
		response.Internal(w)
		return
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
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	if !h.creatorOwnsArticle(r.Context(), id, publicationID, userID) {
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
		title := strings.TrimSpace(*in.Title)
		if _, err := h.pool.Exec(r.Context(),
			`UPDATE "Article" SET title = $2, "updatedAt" = now() WHERE id = $1`,
			id, title); err != nil {
			log.Printf("[creator] update title: %v", err)
			response.Internal(w)
			return
		}
		if in.RegenSlug != nil && *in.RegenSlug {
			slug := h.uniqueArticleSlug(r.Context(), slugify(title))
			h.pool.Exec(r.Context(),
				`UPDATE "Article" SET slug = $2, "updatedAt" = now() WHERE id = $1`, id, slug)
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

	h.serveCreatorArticleByID(w, r, id)
}

// DELETE /v1/creator/articles/{id} — supprime définitivement un de SES articles.
func (h *Handler) apiArticleDelete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	tag, err := h.pool.Exec(r.Context(), `
		DELETE FROM "Article" a
		WHERE a.id = $1 AND (
		  a."authorId"::text = $2
		  OR a."publicationId" = $3
		  OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B"::text = $2)
		)`,
		id, userID, publicationID)
	if err != nil {
		log.Printf("[creator] article delete: %v", err)
		response.Internal(w)
		return
	}
	if tag.RowsAffected() == 0 {
		response.NotFound(w, "Article introuvable")
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// ─── GET /v1/creator/search?q= — recherche plein-texte du CMS ──────────

func (h *Handler) apiSearch(w http.ResponseWriter, r *http.Request) {
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	term := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, offset := parseLimitCursor(r)
	category := r.URL.Query().Get("category")

	result := map[string]any{
		"items": []apiArticleSummary{}, "total": 0,
		"nextCursor": "", "hasMore": false,
	}
	if len(term) < 2 {
		response.OK(w, result)
		return
	}

	where := apiArticlesFrom + `
	  AND (a.title ILIKE '%' || $4 || '%' OR a.content ILIKE '%' || $4 || '%'
	       OR EXISTS (SELECT 1 FROM unnest(a."semanticTags") t WHERE t ILIKE '%' || $4 || '%'))`
	args := []any{publicationID, userID, userID, term}
	if category != "" {
		// Accepte id OU slug pour la catégorie (technique = id, humain = slug)
		where += ` AND (cat.slug = $` + strconv.Itoa(len(args)+1) + ` OR cat.id = $` + strconv.Itoa(len(args)+2) + `)`
		args = append(args, category, category)
	}

	// Total pour la pagination.
	var total int
	countArgs := args
	if err := h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*)::int `+where, countArgs...).Scan(&total); err != nil {
		log.Printf("[creator] search count: %v", err)
		response.Internal(w)
		return
	}

	query := `
		SELECT a.id::text, a.slug, a.title, a.content, a."imageUrl",
		       a."readingTime", a."isPremium", a."createdAt",
		       cat.id::text, cat.slug, cat.name,
		       (a.title ILIKE '%' || $4 || '%') AS title_hit
		` + where + `
		ORDER BY title_hit DESC, a."createdAt" DESC
		LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)

	page := apiArticlesPage{Items: []apiArticleSummary{}}
	rows, err := h.pool.Query(r.Context(), query, append(args, limit+1, offset)...)
	if err != nil {
		log.Printf("[creator] search: %v", err)
		response.Internal(w)
		return
	}
	defer rows.Close()

	ids := map[string]int{}
	for rows.Next() {
		var it apiArticleSummary
		var content string
		var createdAt time.Time
		var catID, catSlug, catName sql.NullString
		var titleHit bool
		if err := rows.Scan(&it.ID, &it.Slug, &it.Title, &content, &it.CoverURL,
			&it.ReadingTime, &it.IsPremium, &createdAt,
			&catID, &catSlug, &catName, &titleHit); err != nil {
			continue
		}
		it.PublishedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
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

	payload := map[string]any{
		"items":      page.Items,
		"total":      total,
		"hasMore":    page.HasMore,
		"nextCursor": page.NextCursor,
	}
	response.OK(w, payload)
}

// =====================================================================
// 🔗 Slugs par auteur — un article co-signé garde un seul ID, mais chaque
// auteur peut avoir SON URL. Résolution publique : slug principal OU tout
// variant (voir GetArticleBySlugAny).
// =====================================================================

// effectiveSlug renvoie le variant personnel de l'auteur s'il existe,
// sinon le slug principal de l'article.
func (h *Handler) effectiveSlug(ctx context.Context, articleID, userID, baseSlug string) string {
	var s string
	err := h.pool.QueryRow(ctx,
		`SELECT slug FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
		articleID, userID).Scan(&s)
	if err != nil || s == "" {
		return baseSlug
	}
	return s
}

// authorSlugs retourne le slug effectif de CHAQUE auteur de l'article :
// principal + co-auteurs — pour que le front puisse ouvrir la version de
// l'autre dans un nouvel onglet.
func (h *Handler) authorSlugs(ctx context.Context, articleID, baseSlug, mainAuthorID string) map[string]string {
	out := map[string]string{mainAuthorID: baseSlug}
	rows, err := h.pool.Query(ctx, `
		SELECT u.id::text,
		       COALESCE(s.slug, $2) AS effective
		FROM "User" u
		JOIN "_CoAuthors" c ON c."B" = u.id AND c."A" = $1
		LEFT JOIN "ArticleSlug" s ON s."articleId" = $1 AND s."ownerUserId" = u.id`, articleID, baseSlug)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid, eff string
		if err := rows.Scan(&uid, &eff); err == nil {
			out[uid] = eff
		}
	}
	return out
}

// PATCH /v1/creator/articles/{id}/slug — définit (ou réinitialise) le
// variant de slug de l'appelant pour cet article.
type apiSlugInput struct {
	Slug string `json:"slug"` // vide → revient au slug principal
}

func (h *Handler) apiArticleSlugSet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	publicationID, _ := middleware.PublicationID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	if !h.creatorOwnsArticle(r.Context(), id, publicationID, userID) {
		response.NotFound(w, "Article introuvable")
		return
	}

	var in apiSlugInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	want := slugify(strings.ToLower(strings.TrimSpace(in.Slug)))
	if want != "" {
		if len(want) < 3 || len(want) > 80 {
			response.BadRequest(w, "Slug doit faire entre 3 et 80 caractères")
			return
		}
		if !slugValidRe.MatchString(want) {
			response.BadRequest(w, "Slug invalide (lettres, chiffres, tirets uniquement)")
			return
		}
		// Slugs réservés
		reserved := map[string]bool{"admin": true, "api": true, "login": true, "_next": true, "oauth": true, "settings": true, "article": true}
		if reserved[want] {
			response.BadRequest(w, "Slug réservé")
			return
		}
	}

	// Le slug principal de l'article = revenir au défaut.
	var baseSlug string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT slug FROM "Article" WHERE id = $1`, id).Scan(&baseSlug); err != nil {
		response.NotFound(w, "Article introuvable")
		return
	}
	if want == "" || want == baseSlug {
		h.pool.Exec(r.Context(),
			`DELETE FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
			id, userID)
		response.OK(w, map[string]string{"slug": baseSlug})
		return
	}

	// Sauvegarde l'ancien variant pour redirection 301 avant écrasement.
	var oldSlug string
	_ = h.pool.QueryRow(r.Context(),
		`SELECT slug FROM "ArticleSlug" WHERE "articleId" = $1 AND "ownerUserId"::text = $2`,
		id, userID).Scan(&oldSlug)
	// Unicité globale avec auto-suffixe (-1, -2…) si déjà pris (inclut historique).
	candidate := want
	for n := 1; ; n++ {
		var taken bool
		if err := h.pool.QueryRow(r.Context(),
			`SELECT EXISTS(
			   SELECT 1 FROM "Article" WHERE slug = $1
			   UNION ALL
			   SELECT 1 FROM "ArticleSlug" WHERE slug = $1
			     AND NOT ("articleId" = $2 AND "ownerUserId"::text = $3)
			   UNION ALL
			   SELECT 1 FROM "ArticleSlugHistory" WHERE slug = $1
			 )`, candidate, id, userID).Scan(&taken); err != nil {
			response.Internal(w)
			return
		}
		if !taken {
			break
		}
		candidate = want + "-" + strconv.Itoa(n)
	}
	want = candidate
	if oldSlug != "" && oldSlug != want {
		h.pool.Exec(r.Context(),
			`INSERT INTO "ArticleSlugHistory" (id, "articleId", slug) VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT (slug) DO NOTHING`,
			id, oldSlug)
	}

	h.pool.Exec(r.Context(), `
		INSERT INTO "ArticleSlug" (id, "articleId", "ownerUserId", slug, "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2::uuid, $3, now(), now())
		ON CONFLICT ("articleId", "ownerUserId")
		DO UPDATE SET slug = EXCLUDED.slug, "updatedAt" = now()`,
		id, userID, want)

	response.OK(w, map[string]string{"slug": want})
}
