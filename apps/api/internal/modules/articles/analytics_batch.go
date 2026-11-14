package articles

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func periodCutoff(period string) *time.Time {
	var d time.Duration
	switch period {
	case "7d":
		d = 7 * 24 * time.Hour
	case "30d":
		d = 30 * 24 * time.Hour
	case "90d":
		d = 90 * 24 * time.Hour
	case "all":
		return nil
	default:
		d = 30 * 24 * time.Hour
	}
	t := time.Now().Add(-d)
	return &t
}

func (s *Service) fetchViewsBatch(ctx context.Context, ids []string, cutoff *time.Time) (map[string]int, map[string]int) {
	views := map[string]int{}
	uniques := map[string]int{}
	if s.pool == nil || len(ids) == 0 {
		return views, uniques
	}
	// Views totaux
	q := `SELECT "articleId", COUNT(*)::int FROM "ReadingSession" WHERE "articleId" = ANY($1)`
	args := []interface{}{ids}
	if cutoff != nil {
		q += ` AND "createdAt" >= $2`
		args = append(args, *cutoff)
	}
	q += ` GROUP BY "articleId"`
	rows, err := s.pool.Query(ctx, q, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			var c int
			if err := rows.Scan(&id, &c); err == nil {
				views[id] = c
			}
		}
	}
	// Uniques (distinct userId non null)
	q2 := `SELECT "articleId", COUNT(DISTINCT "userId")::int FROM "ReadingSession" WHERE "articleId" = ANY($1) AND "userId" IS NOT NULL`
	args2 := []interface{}{ids}
	if cutoff != nil {
		q2 += ` AND "createdAt" >= $2`
		args2 = append(args2, *cutoff)
	}
	q2 += ` GROUP BY "articleId"`
	rows2, err := s.pool.Query(ctx, q2, args2...)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var id string
			var c int
			if err := rows2.Scan(&id, &c); err == nil {
				uniques[id] = c
			}
		}
	}
	return views, uniques
}

func (s *Service) fetchCommentsBatch(ctx context.Context, ids []string) map[string]int {
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "articleId", COUNT(*)::int FROM "ArticleComment" WHERE "articleId" = ANY($1) GROUP BY "articleId"`)
}

func (s *Service) fetchLikesBatch(ctx context.Context, ids []string) map[string]int {
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "articleId", COUNT(*)::int FROM "ContentFeedback" WHERE "articleId" = ANY($1) AND "type" = 'LIKE' GROUP BY "articleId"`)
}

func (s *Service) fetchRepostsBatch(ctx context.Context, ids []string) map[string]int {
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "quotedArticleId", COUNT(*)::int FROM "Post" WHERE "quotedArticleId" = ANY($1) GROUP BY "quotedArticleId"`)
}

// fetchScheduledBatch rend la date de programmation (RFC 3339, UTC) des
// articles concernés. Une seule requête par page, et rien du tout quand
// aucun article n'est programmé : la colonne n'est pas dans le SELECT de
// ListArticlesWithCategory (sqlc), on l'enrichit ici sans régénérer le code.
func (s *Service) fetchScheduledBatch(ctx context.Context, ids []string) map[string]string {
	m := map[string]string{}
	if s.pool == nil || len(ids) == 0 {
		return m
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, "scheduledAt" FROM "Article"
		 WHERE id = ANY($1) AND "scheduledAt" IS NOT NULL`, ids)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var at pgtype.Timestamp
		if err := rows.Scan(&id, &at); err == nil && at.Valid {
			m[id] = at.Time.UTC().Format(time.RFC3339)
		}
	}
	return m
}

func (s *Service) fetchArticleCountBatch(ctx context.Context, ids []string, query string) map[string]int {
	m := map[string]int{}
	if s.pool == nil || len(ids) == 0 {
		return m
	}
	rows, err := s.pool.Query(ctx, query, ids)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var c int
		if err := rows.Scan(&id, &c); err == nil {
			m[id] = c
		}
	}
	return m
}
