package creator

import (
	"context"
	"log"
	"strconv"
	"time"
)

// =====================================================================
// 🖍️ Surlignages publics exposés à l'API créateur (clé API, scope READ).
// Couvre les articles liés au créateur : publication de la clé, articles
// signés ou co-écrits (_CoAuthors). Filtre optionnel par slug d'article.
// =====================================================================

type apiHighlightItem struct {
	ID       string  `json:"id"`
	Text     string  `json:"text"`
	Note     *string `json:"note,omitempty"`
	IsPublic bool    `json:"isPublic"`
	// IsOfficial = annotation éditoriale de l'auteur de l'article.
	IsOfficial bool            `json:"isOfficial"`
	CreatedAt  string          `json:"createdAt"`
	Upvotes    int64           `json:"upvotesCount"`
	Comments   int64           `json:"commentsCount"`
	Reader     apiActor        `json:"reader"`
	Article    apiArticleBrief `json:"article"`
}

type apiActor struct {
	ID       string  `json:"id"`
	Username *string `json:"username"`
	Name     *string `json:"name"`
	LogoURL  *string `json:"logoUrl"`
}

type apiArticleBrief struct {
	ID      string   `json:"id"`
	Slug    string   `json:"slug"`
	Title   string   `json:"title"`
	Authors []string `json:"authors"`
}

type apiHighlightsPage struct {
	Items      []apiHighlightItem `json:"items"`
	NextCursor string             `json:"nextCursor"`
	HasMore    bool               `json:"hasMore"`
}

const apiHighlightsQuery = `
	SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."createdAt",
	       h."upvotesCount",
	       (SELECT COUNT(*) FROM "AnnotationComment" c WHERE c."highlightId" = h.id) AS comments,
	       u.id::text AS reader_id, u.username, u.name, u."logoUrl",
	       a.id AS article_id, a.slug, a.title, a."authorId"::text AS author_id
	FROM "Highlight" h
	JOIN "Article" a ON a.id = h."articleId"
	JOIN "User" u ON u.id = h."readerId"
	WHERE h."isPublic" = true
	  AND (
	    a."publicationId" = $1
	    OR a."authorId"::text = $2
	    OR a.id IN (SELECT "A" FROM "_CoAuthors" WHERE "B" = $3)
	  )`

// apiHighlightsPage renvoie une page de surlignages publics des lecteurs.
// articleSlug optionnel : restreint à un seul article.
func (h *Handler) apiHighlightsPage(
	ctx context.Context,
	publicationID, userID, articleSlug string,
	officialOnly bool,
	limit, offset int,
) (apiHighlightsPage, error) {
	page := apiHighlightsPage{Items: []apiHighlightItem{}}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	query := apiHighlightsQuery
	args := []any{publicationID, userID, userID}
	if articleSlug != "" {
		query += ` AND a.slug = $4`
		args = append(args, articleSlug)
	}
	if officialOnly {
		n := len(args) + 1
		query += ` AND h."isOfficial" = $` + strconv.Itoa(n)
		args = append(args, true)
	}
	query += `
		ORDER BY h."createdAt" DESC
		LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	args = append(args, limit+1, offset)

	rows, err := h.pool.Query(ctx, query, args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	articleIDs := map[string]int{}
	for rows.Next() {
		var it apiHighlightItem
		var readerName, readerUsername, readerLogo *string
		var articleAuthorID string
		var createdAt time.Time
		if err := rows.Scan(
			&it.ID, &it.Text, &it.Note, &it.IsPublic, &it.IsOfficial, &createdAt,
			&it.Upvotes, &it.Comments,
			&it.Reader.ID, &readerUsername, &readerName, &readerLogo,
			&it.Article.ID, &it.Article.Slug, &it.Article.Title, &articleAuthorID,
		); err != nil {
			continue
		}
		it.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
		it.Reader.Username = readerUsername
		it.Reader.Name = readerName
		it.Reader.LogoURL = readerLogo
		it.Article.Authors = []string{articleAuthorID}
		if _, seen := articleIDs[it.Article.ID]; !seen {
			articleIDs[it.Article.ID] = len(page.Items)
		}
		page.Items = append(page.Items, it)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}

	h.appendCoAuthors(ctx, page.Items, articleIDs)

	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		page.HasMore = true
		page.NextCursor = strconv.Itoa(offset + limit)
	}
	return page, nil
}

// appendCoAuthors complète article.authors avec les co-auteurs (batch unique).
func (h *Handler) appendCoAuthors(ctx context.Context, items []apiHighlightItem, articleIDs map[string]int) {
	if len(articleIDs) == 0 {
		return
	}
	args := make([]string, 0, len(articleIDs))
	for id := range articleIDs {
		args = append(args, id)
	}
	rows, err := h.pool.Query(ctx, `
		SELECT c."A", u.id::text
		FROM "_CoAuthors" c JOIN "User" u ON u.id = c."B"
		WHERE c."A" = ANY($1::text[])`, args)
	if err != nil {
		log.Printf("[creator] co-auteurs: %v", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var articleID, coAuthorID string
		if err := rows.Scan(&articleID, &coAuthorID); err != nil {
			continue
		}
		if idx, ok := articleIDs[articleID]; ok && idx < len(items) {
			items[idx].Article.Authors = append(items[idx].Article.Authors, coAuthorID)
		}
	}
}

// apiComment est une réponse/discussion sur un surlignage, exposée à
// l'API créateur. IsAuthor = commentaire de l'auteur de l'article
// (réponse éditoriale) — permet au front de la styliser comme telle.
type apiComment struct {
	ID        string   `json:"id"`
	Content   string   `json:"content"`
	CreatedAt string   `json:"createdAt"`
	Author    apiActor `json:"author"`
	IsAuthor  bool     `json:"isAuthor"`
}

// highlightComments renvoie les commentaires d'un surlignage, auteur de
// l'article résolu pour poser le flag isAuthor.
func (h *Handler) highlightComments(ctx context.Context, highlightID string) ([]apiComment, error) {
	out := []apiComment{}
	rows, err := h.pool.Query(ctx, `
		SELECT c.id::text, c.content, c."createdAt",
		       u.id::text, u.username, u.name, u."logoUrl",
		       COALESCE(a."authorId"::text, ''),
		       (c."authorId"::text = COALESCE(a."authorId"::text,''))
		FROM "AnnotationComment" c
		JOIN "User" u ON u.id = c."authorId"
		JOIN "Highlight" h ON h.id = c."highlightId"
		JOIN "Article" a ON a.id = h."articleId"
		WHERE c."highlightId" = $1
		ORDER BY c."createdAt" ASC`, highlightID)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	for rows.Next() {
		var c apiComment
		var createdAt time.Time
		var articleAuthor string
		if err := rows.Scan(
			&c.ID, &c.Content, &createdAt,
			&c.Author.ID, &c.Author.Username, &c.Author.Name, &c.Author.LogoURL,
			&articleAuthor, &c.IsAuthor,
		); err != nil {
			continue
		}
		c.CreatedAt = createdAt.Format("2006-01-02T15:04:05Z07:00")
		out = append(out, c)
	}
	return out, rows.Err()
}
