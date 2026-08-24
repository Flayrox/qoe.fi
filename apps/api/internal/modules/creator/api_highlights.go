package creator

import (
	"context"
	"strconv"
	"time"
)

// apiHighlightItem est un surlignage exposé par l'API créateur (clé API,
// scope READ) : lecture publique des annotations sur les articles de la
// publication du créateur.
type apiHighlightItem struct {
	ID        string          `json:"id"`
	Text      string          `json:"text"`
	Note      *string         `json:"note,omitempty"`
	IsPublic  bool            `json:"isPublic"`
	CreatedAt string          `json:"createdAt"`
	Upvotes   int64           `json:"upvotesCount"`
	Comments  int64           `json:"commentsCount"`
	Reader    apiActor        `json:"reader"`
	Article   apiArticleBrief `json:"article"`
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
	Authors []string `json:"authors"` // auteur principal + co-auteurs (userIds)
}

type apiHighlightsPage struct {
	Items      []apiHighlightItem `json:"items"`
	NextCursor string             `json:"nextCursor"`
	HasMore    bool               `json:"hasMore"`
}

// apiHighlightsPageQuery renvoie une page de surlignages publics portant
// sur les articles liés au créateur : publication de la clé API, articles
// dont il est l'auteur, ou articles co-écrits (_CoAuthors).
func (h *Handler) apiHighlightsPage(ctx context.Context, publicationID, userID string, limit, offset int) (apiHighlightsPage, error) {
	page := apiHighlightsPage{Items: []apiHighlightItem{}}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := h.pool.Query(ctx, `
		SELECT h.id, h.text, h.note, h."isPublic", h."createdAt",
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
		  )
		ORDER BY h."createdAt" DESC
		LIMIT $4 OFFSET $5`,
		publicationID, userID, userID, limit+1, offset)
	if err != nil {
		return page, err
	}
	defer rows.Close()

	for rows.Next() {
		var it apiHighlightItem
		var readerName, readerUsername, readerLogo *string
		var articleAuthorID string
		var createdAt time.Time
		if err := rows.Scan(
			&it.ID, &it.Text, &it.Note, &it.IsPublic, &createdAt,
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
		page.Items = append(page.Items, it)
	}
	if err := rows.Err(); err != nil {
		return page, err
	}

	// Co-auteurs pour les articles de la page (un seul batch).
	if len(page.Items) > 0 {
		ids := map[string]int{}
		for i := range page.Items {
			ids[page.Items[i].Article.ID] = i
		}
		args := make([]any, 0, len(ids))
		for id := range ids {
			args = append(args, id)
		}
		q := `SELECT "A", "B"::text FROM "_CoAuthors" WHERE "A" = ANY($1::text[])`
		corows, err := h.pool.Query(ctx, q, args)
		if err == nil {
			for corows.Next() {
				var articleID, co string
				if err := corows.Scan(&articleID, &co); err == nil {
					if idx, ok := ids[articleID]; ok {
						page.Items[idx].Article.Authors = append(
							page.Items[idx].Article.Authors, co)
					}
				}
			}
			corows.Close()
		}
	}

	// take+1 : hasMore + curseur d'offset.
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		page.HasMore = true
		page.NextCursor = strconv.Itoa(offset + limit)
	}
	return page, nil
}
