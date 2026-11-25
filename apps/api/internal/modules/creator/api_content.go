package creator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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
// La coupe se fait en runes : couper des octets casserait un caractère
// multi-octets et produirait un extrait UTF-8 invalide.
func stripHTMLTags(html string, max int) string {
	text := strings.Join(strings.Fields(tagStripper.ReplaceAllString(html, " ")), " ")
	if max <= 0 || utf8.RuneCountInString(text) <= max {
		return text
	}
	runes := []rune(text)
	cut := string(runes[:max])
	if idx := strings.LastIndex(cut, " "); idx > 0 {
		cut = cut[:idx]
	}
	return strings.TrimSpace(cut) + "…"
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
	Category               *apiCategoryRef `json:"category,omitempty"`
	ID                     string          `json:"id"`
	Slug                   string          `json:"slug"`
	ShortCode              *string         `json:"shortCode,omitempty"`
	Title                  string          `json:"title"`
	Excerpt                string          `json:"excerpt"`
	CoverURL               *string         `json:"coverImageUrl"`
	ImageURL               *string         `json:"imageUrl"`
	Status                 string          `json:"status"`
	Published              bool            `json:"published"`
	ReadingTime            int32           `json:"readingTime"`
	IsPremium              bool            `json:"isPremium"`
	Visibility             string          `json:"visibility"`
	AllowComments          bool            `json:"allowComments"`
	AllowPublicAnnotations bool            `json:"allowPublicAnnotations"`
	AllowDownload          bool            `json:"allowDownload"`
	SeoTitle               *string         `json:"seoTitle,omitempty"`
	SeoDescription         *string         `json:"seoDescription,omitempty"`
	CanonicalType          *string         `json:"canonicalType,omitempty"`
	CanonicalURL           *string         `json:"canonicalUrl,omitempty"`
	PublishedAt            string          `json:"publishedAt"`
	UpdatedAt              string          `json:"updatedAt"`
	ScheduledAt            *string         `json:"scheduledAt,omitempty"`
	Authors                []apiAuthor     `json:"authors"`
}

type apiArticlesPage struct {
	Items      []apiArticleSummary `json:"items"`
	NextCursor string              `json:"nextCursor"`
	HasMore    bool                `json:"hasMore"`
}

type apiArticleFull struct {
	apiArticleSummary
	ContentHTML           string `json:"contentHtml"`
	ContentMarkdown       string `json:"contentMarkdown"`
	HasUnpublishedChanges bool   `json:"hasUnpublishedChanges"`
	Tags                  []any  `json:"tags"`
}

// ─── GET /v1/creator/me ────────────────────────────────────────────────

// apiMe agrège l'identité de la clé : publication portée + scopes effectifs.
type apiMe struct {
	Publisher struct {
		ID           string  `json:"id"`
		Name         string  `json:"name"`
		Slug         string  `json:"slug"`
		LogoURL      *string `json:"logoUrl"`
		HeroText     *string `json:"heroText"`
		Subdomain    *string `json:"subdomain"`
		CustomDomain *string `json:"customDomain"`
	} `json:"publisher"`
	UserID string   `json:"userId"`
	Scopes []string `json:"scopes"`
}

func (h *Handler) apiMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	pubID, _ := middleware.PublisherID(r.Context())

	var m apiMe
	m.UserID = userID
	if scopes, ok := middleware.Scopes(r.Context()); ok {
		m.Scopes = scopes
	} else {
		m.Scopes = middleware.AllScopes
	}

	err := h.pool.QueryRow(r.Context(), `
		SELECT id::text, name, slug, "logoUrl", "heroText", subdomain, "customDomain"
		FROM "Publisher" WHERE id = $1`,
		pubID).Scan(&m.Publisher.ID, &m.Publisher.Name, &m.Publisher.Slug,
		&m.Publisher.LogoURL, &m.Publisher.HeroText,
		&m.Publisher.Subdomain, &m.Publisher.CustomDomain)
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
	    a."publisherId" = $1
	    OR ($2 <> '' AND a."authorId"::text = $2)
	    OR ($3 <> '' AND a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B"::text = $3))
	  )
	  AND (a."isClaimed" = true OR a."isAuthorSovereignCopy" = false)`

var apiArticlesSorts = map[string]string{
	"published_desc": `a."createdAt" DESC`,
	"published_asc":  `a."createdAt" ASC`,
	"title_asc":      `a.title ASC`,
	"title_desc":     `a.title DESC`,
}

func (h *Handler) resolveAuthors(ctx context.Context, articleIDs map[string]int, items byAuthorSetter) error {
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
		return fmt.Errorf("auteurs: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var scanArticleID, mainAuthorID, userID string
		var username, name *string
		if err := rows.Scan(&scanArticleID, &mainAuthorID, &username, &name, &userID); err != nil {
			return fmt.Errorf("auteurs scan: %w", err)
		}
		idx, ok := articleIDs[scanArticleID]
		if ok {
			items.setAuthor(idx, apiAuthor{ID: userID, Username: username, Name: name})
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("auteurs rows: %w", err)
	}
	return nil
}

// ─── GET /v1/creator/categories ────────────────────────────────────────

// apiCategoryItem : rubrique de la publication avec son volume d'articles
// publiés — la table des matières du CMS.
type apiCategoryItem struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	Description  *string `json:"description,omitempty"`
	ParentID     *string `json:"parentId"`
	IsDefault    bool    `json:"isDefault"`
	ArticleCount int     `json:"articleCount"`
}

func (h *Handler) apiCategories(w http.ResponseWriter, r *http.Request) {
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	items := []apiCategoryItem{}
	rows, err := h.pool.Query(r.Context(), `
		SELECT c.id::text, c.slug, c.name, c.description,
		       c."parentId"::text, c."isDefault",
		       COUNT(a.id)::int AS article_count
		FROM "Category" c
		LEFT JOIN "Article" a
		  ON a."categoryId" = c.id AND a.published = true AND a.status = 'PUBLISHED'
		WHERE c."publisherId" = $1
		   OR c."publisherId" IN (
		     SELECT DISTINCT a2."publisherId" FROM "Article" a2
		     WHERE a2."authorId"::text = $2 AND a2.published = true
		   )
		GROUP BY c.id, c.slug, c.name, c.description, c."parentId", c."isDefault"
		ORDER BY c.name ASC`, publisherID, userID)
	if err != nil {
		log.Printf("[creator] api categories: %v", err)
		response.Internal(w)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var it apiCategoryItem
		if err := rows.Scan(&it.ID, &it.Slug, &it.Name, &it.Description, &it.ParentID, &it.IsDefault, &it.ArticleCount); err != nil {
			log.Printf("[creator] api categories scan: %v", err)
			response.Internal(w)
			return
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		log.Printf("[creator] api categories rows: %v", err)
		response.Internal(w)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600")
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
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	q := r.URL.Query()
	limit, offset := parseLimitCursor(r)

	// ── Filtres CMS : catégorie, tag, premium, recherche, dates ──
	where := apiArticlesFrom
	args := []any{publisherID, userID, userID}
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
	// Mode quarantaine lecture seule : ne renvoyer que les articles publiés
	// créés avant le déclenchement de la restriction (<= suspendedAt).
	if cutoff, ro := middleware.ReadOnlyCutoff(r.Context()); ro {
		add(` AND a.published = true AND a.status = 'PUBLISHED' AND a."createdAt" <= $?`, cutoff)
	} else {
		// Status filter: draft, scheduled, submitted, published (default), all
		switch q.Get("status") {
		case "draft":
			add(` AND a.status = 'DRAFT'`)
		case "scheduled":
			add(` AND a.status = 'SCHEDULED'`)
		case "submitted":
			add(` AND a.status = 'SUBMITTED'`)
		case "all":
			// no filter
		default:
			add(` AND a.published = true AND a.status = 'PUBLISHED'`)
		}
	}
	if term := q.Get("q"); term != "" {
		add(` AND a.title ILIKE '%' || $? || '%'`, term)
	}
	// Bornes de dates : validées en amont pour renvoyer 400 plutôt qu'une
	// erreur SQL 500 sur une valeur illisible.
	for _, param := range []string{"since", "until"} {
		if v := q.Get(param); v != "" {
			if _, err := time.Parse("2006-01-02", v); err != nil {
				response.BadRequest(w, param+" doit être au format AAAA-MM-JJ")
				return
			}
			if param == "since" {
				add(` AND a."createdAt" >= $?::date`, v)
			} else {
				add(` AND a."createdAt" < ($?::date + INTERVAL '1 day')`, v)
			}
		}
	}

	order, ok := apiArticlesSorts[q.Get("sort")]
	if !ok {
		order = apiArticlesSorts["published_desc"]
	}

	page := apiArticlesPage{Items: []apiArticleSummary{}}
	rows, err := h.pool.Query(r.Context(), `
		SELECT a.id::text, a.slug, a."shortCode", a.title, COALESCE(a.content,''), a."imageUrl",
		       a.status, a.published, a."readingTime", a."isPremium", a.visibility::text,
		       a."allowComments", a."allowPublicAnnotations", a."allowDownload",
		       a."seoTitle", a."seoDescription", a."canonicalType", a."canonicalUrl",
		       a."createdAt", a."updatedAt", a."scheduledAt",
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
		var publishedAt, updatedAt time.Time
		var scheduledAt sql.NullTime
		var catID, catSlug, catName sql.NullString
		if err := rows.Scan(
			&it.ID, &it.Slug, &it.ShortCode, &it.Title, &content, &it.CoverURL,
			&it.Status, &it.Published, &it.ReadingTime, &it.IsPremium, &it.Visibility,
			&it.AllowComments, &it.AllowPublicAnnotations, &it.AllowDownload,
			&it.SeoTitle, &it.SeoDescription, &it.CanonicalType, &it.CanonicalURL,
			&publishedAt, &updatedAt, &scheduledAt,
			&catID, &catSlug, &catName); err != nil {
			log.Printf("[creator] articles scan: %v", err)
			response.Internal(w)
			return
		}
		it.ImageURL = it.CoverURL
		it.PublishedAt = publishedAt.Format("2006-01-02T15:04:05Z07:00")
		it.UpdatedAt = updatedAt.Format("2006-01-02T15:04:05Z07:00")
		if scheduledAt.Valid {
			s := scheduledAt.Time.Format("2006-01-02T15:04:05Z07:00")
			it.ScheduledAt = &s
		}
		it.Excerpt = stripHTMLTags(content, 180)
		it.Authors = []apiAuthor{}
		if catID.Valid {
			it.Category = &apiCategoryRef{ID: catID.String, Slug: catSlug.String, Name: catName.String}
		}
		ids[it.ID] = len(page.Items)
		page.Items = append(page.Items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("[creator] articles rows: %v", err)
		response.Internal(w)
		return
	}

	if err := h.resolveAuthors(r.Context(), ids, &page); err != nil {
		log.Printf("[creator] articles %v", err)
		response.Internal(w)
		return
	}
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

	// Le total ne peut pas être "fabriqué" à 0 : une panne du COUNT est une
	// panne de la requête, pas un résultat vide.
	var total int
	if err := h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*)::int `+where, args...).Scan(&total); err != nil {
		log.Printf("[creator] articles total: %v", err)
		response.Internal(w)
		return
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	payload := map[string]any{
		"items":      page.Items,
		"total":      total,
		"hasMore":    page.HasMore,
		"nextCursor": page.NextCursor,
	}
	switch q.Get("status") {
	case "draft", "scheduled", "submitted", "all":
		w.Header().Set("Cache-Control", "private, no-store")
	default:
		w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
	}
	response.OK(w, payload)
}

// loadCreatorArticleFull charge l'article complet (shape détail, contenu HTML
// + markdown) lié au créateur : publication de la clé, signature ou
// co-écriture. Slug principal ou variante personnelle accepté.
// pgx.ErrNoRows si l'article n'est pas lié au créateur.
func (h *Handler) loadCreatorArticleFull(
	ctx context.Context,
	publisherID, userID, slug string,
) (*apiArticleFull, error) {
	var full apiArticleFull
	full.Authors = []apiAuthor{}
	var publishedAt, updatedAt time.Time
	var scheduledAt sql.NullTime
	var draftContent sql.NullString
	var tags []string
	var catID, catSlug, catName sql.NullString
	roCond := ""
	qArgs := []any{publisherID, userID, userID, slug}
	if cutoff, ro := middleware.ReadOnlyCutoff(ctx); ro {
		roCond = ` AND a.published = true AND a.status = 'PUBLISHED' AND a."createdAt" <= $5`
		qArgs = append(qArgs, cutoff)
	}
	err := h.pool.QueryRow(ctx, `
		SELECT a.id::text, a.slug, a."shortCode", a.title, COALESCE(a.content,''), a."draftContent", a."imageUrl",
		       a.status, a.published, a."readingTime", a."isPremium", a.visibility::text,
		       a."allowComments", a."allowPublicAnnotations", a."allowDownload",
		       a."seoTitle", a."seoDescription", a."canonicalType", a."canonicalUrl",
		       a."createdAt", a."updatedAt", a."scheduledAt",
		       a."semanticTags", cat.id::text, cat.slug, cat.name
		`+apiArticlesFrom+` AND (a.slug = $4
		   OR EXISTS (SELECT 1 FROM "ArticleSlug" s WHERE s.slug = $4 AND s."articleId" = a.id)
		   OR EXISTS (SELECT 1 FROM "ArticleSlugHistory" h WHERE h.slug = $4 AND h."articleId" = a.id))`+roCond+`
		LIMIT 1`,
		qArgs...).Scan(
		&full.ID, &full.Slug, &full.ShortCode, &full.Title, &full.ContentHTML, &draftContent, &full.CoverURL,
		&full.Status, &full.Published, &full.ReadingTime, &full.IsPremium, &full.Visibility,
		&full.AllowComments, &full.AllowPublicAnnotations, &full.AllowDownload,
		&full.SeoTitle, &full.SeoDescription, &full.CanonicalType, &full.CanonicalURL,
		&publishedAt, &updatedAt, &scheduledAt, &tags,
		&catID, &catSlug, &catName)
	if err != nil {
		return nil, err
	}
	full.ImageURL = full.CoverURL
	full.HasUnpublishedChanges = draftContent.Valid && draftContent.String != ""
	full.PublishedAt = publishedAt.Format("2006-01-02T15:04:05Z07:00")
	full.UpdatedAt = updatedAt.Format("2006-01-02T15:04:05Z07:00")
	if scheduledAt.Valid {
		s := scheduledAt.Time.Format("2006-01-02T15:04:05Z07:00")
		full.ScheduledAt = &s
	}
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
	baseSlug := full.Slug
	full.Slug = h.effectiveSlug(ctx, full.ID, userID, baseSlug)

	ids := map[string]int{full.ID: 0}
	if err := h.resolveAuthors(ctx, ids, &full); err != nil {
		return nil, err
	}
	full.Authors = h.withEffectiveSlugs(ctx, full.ID, full.Authors, baseSlug)
	return &full, nil
}

// GET /v1/creator/articles/{slug} — article complet (contenu HTML).
func (h *Handler) apiArticleBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	publisherID, _ := middleware.PublisherID(r.Context())
	userID, _ := middleware.UserID(r.Context())

	full, err := h.loadCreatorArticleFull(r.Context(), publisherID, userID, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[creator] api article by slug: %v", err)
		response.Internal(w)
		return
	}
	if full.Published && full.Status == "PUBLISHED" {
		w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
	} else {
		w.Header().Set("Cache-Control", "private, no-store")
	}
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
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), 20, 100)
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
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

// ─── GET /v1/creator/search?q= — recherche plein-texte du CMS ──────────

func (h *Handler) apiSearch(w http.ResponseWriter, r *http.Request) {
	publisherID, _ := middleware.PublisherID(r.Context())
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
	args := []any{publisherID, userID, userID, term}
	if category != "" {
		// Accepte id OU slug pour la catégorie (technique = id, humain = slug)
		where += ` AND (cat.slug = $` + strconv.Itoa(len(args)+1) + ` OR cat.id = $` + strconv.Itoa(len(args)+2) + `)`
		args = append(args, category, category)
	}
	if cutoff, ro := middleware.ReadOnlyCutoff(r.Context()); ro {
		where += ` AND a.published = true AND a.status = 'PUBLISHED' AND a."createdAt" <= $` + strconv.Itoa(len(args)+1)
		args = append(args, cutoff)
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
		SELECT a.id::text, a.slug, a."shortCode", a.title, COALESCE(a.content,''), a."imageUrl",
		       a.status, a.published, a."readingTime", a."isPremium", a.visibility::text,
		       a."allowComments", a."allowPublicAnnotations", a."allowDownload",
		       a."seoTitle", a."seoDescription", a."canonicalType", a."canonicalUrl",
		       a."createdAt", a."updatedAt", a."scheduledAt",
		       cat.id::text, cat.slug, cat.name,
		       (a.title ILIKE '%' || $4 || '%') AS title_hit
		` + where + `
		ORDER BY title_hit DESC, a."createdAt" DESC, a.id DESC
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
		var createdAt, updatedAt time.Time
		var scheduledAt sql.NullTime
		var catID, catSlug, catName sql.NullString
		var titleHit bool
		if err := rows.Scan(
			&it.ID, &it.Slug, &it.ShortCode, &it.Title, &content, &it.CoverURL,
			&it.Status, &it.Published, &it.ReadingTime, &it.IsPremium, &it.Visibility,
			&it.AllowComments, &it.AllowPublicAnnotations, &it.AllowDownload,
			&it.SeoTitle, &it.SeoDescription, &it.CanonicalType, &it.CanonicalURL,
			&createdAt, &updatedAt, &scheduledAt,
			&catID, &catSlug, &catName, &titleHit); err != nil {
			log.Printf("[creator] search scan: %v", err)
			response.Internal(w)
			return
		}
		it.ImageURL = it.CoverURL
		it.PublishedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
		it.UpdatedAt = updatedAt.Format("2006-01-02T15:04:05Z07:00")
		if scheduledAt.Valid {
			s := scheduledAt.Time.Format("2006-01-02T15:04:05Z07:00")
			it.ScheduledAt = &s
		}
		it.Excerpt = stripHTMLTags(content, 180)
		it.Authors = []apiAuthor{}
		if catID.Valid {
			it.Category = &apiCategoryRef{ID: catID.String, Slug: catSlug.String, Name: catName.String}
		}
		ids[it.ID] = len(page.Items)
		page.Items = append(page.Items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("[creator] search rows: %v", err)
		response.Internal(w)
		return
	}

	if err := h.resolveAuthors(r.Context(), ids, &page); err != nil {
		log.Printf("[creator] search %v", err)
		response.Internal(w)
		return
	}

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
	w.Header().Set("Cache-Control", "private, no-store")
	response.OK(w, payload)
}
