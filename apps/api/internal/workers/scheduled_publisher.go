// Package workers — publication automatique des articles programmés.
package workers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/anchors"
	"github.com/qoefi/api/internal/queue"
)

// ScheduledArticle est la ligne minimale nécessaire pour basculer un article
// programmé à PUBLISHED et déclencher le fanout asynq (mêmes champs que le
// payload ArticlePublishedPayload du publish manuel).
type ScheduledArticle struct {
	ID            string
	PublicationID string
	AuthorID      string
	Title         string
	Slug          string
	Visibility    string
}

// PublishScheduledArticlePayload construit le payload asynq article.published
// (même format que emitPublished du module articles → webhooks + newsletter).
func PublishScheduledArticlePayload(a ScheduledArticle) queue.ArticlePublishedPayload {
	return queue.ArticlePublishedPayload{
		EventID:       "article_published_" + a.ID,
		PublicationID: a.PublicationID,
		ArticleID:     a.ID,
		AuthorID:      a.AuthorID,
		Title:         a.Title,
		Slug:          a.Slug,
		Visibility:    a.Visibility,
		PublishedAt:   time.Now().UTC().Format(time.RFC3339),
	}
}

// runScheduledPublisherOnce exécute un cycle complet : sélectionne les articles
// SCHEDULED dont scheduledAt est passé, les bascule à PUBLISHED, puis enqueue
// le fanout asynq (article.published → webhooks + newsletter, embedding
// sémantique, sync Meilisearch) — exactement comme un publish manuel via
// l'API. Retourne le nombre d'articles publiés.
//
// Concurrence : SELECT ... FOR UPDATE SKIP LOCKED dans une transaction — deux
// instances du worker ne peuvent pas traiter le même article deux fois, et
// l'UPDATE est visible atomiquement avant le fanout asynq.
func runScheduledPublisherOnce(ctx context.Context, pool *pgxpool.Pool, ac *asynq.Client) (int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op après commit

	rows, err := tx.Query(ctx, `
		SELECT id, "publicationId", "authorId", title, slug, visibility
		FROM "Article"
		WHERE status = 'SCHEDULED' AND "scheduledAt" IS NOT NULL AND "scheduledAt" <= now()
		ORDER BY "scheduledAt" ASC
		FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return 0, fmt.Errorf("query: %w", err)
	}

	var due []ScheduledArticle
	for rows.Next() {
		var a ScheduledArticle
		if err := rows.Scan(&a.ID, &a.PublicationID, &a.AuthorID, &a.Title, &a.Slug, &a.Visibility); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan: %w", err)
		}
		due = append(due, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("rows: %w", err)
	}

	if len(due) == 0 {
		return 0, tx.Commit(ctx) // rien à faire, libère les locks
	}

	for _, a := range due {
		if _, err := tx.Exec(ctx,
			`UPDATE "Article" SET status = 'PUBLISHED', published = true WHERE id = $1`, a.ID); err != nil {
			return 0, fmt.Errorf("update %s: %w", a.ID, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	// Fanout asynq APRÈS le commit : les handlers (webhooks, newsletter)
	// lisent l'article déjà PUBLISHED en base.
	for _, a := range due {
		// Ré-ancrage des surlignages sur le contenu final avant exposition.
		anchors.ReanchorArticle(ctx, pool, a.ID)
		_ = queue.PublishArticlePublished(ac, PublishScheduledArticlePayload(a))
		_ = queue.PublishArticleEmbedding(ac, queue.EmbeddingPayload{ArticleID: a.ID})
		_ = queue.PublishSearchSync(ac, queue.SearchSyncPayload{ArticleID: a.ID, Action: "upsert"})
	}
	return len(due), nil
}

// RunScheduledPublisher boucle sur runScheduledPublisherOnce toutes les
// `interval`. Le tick initial s'exécute au démarrage (rattrape les articles
// passés pendant une coupure du worker).
func RunScheduledPublisher(ctx context.Context, pool *pgxpool.Pool, ac *asynq.Client, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	run := func() {
		ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		n, err := runScheduledPublisherOnce(ctxTimeout, pool, ac)
		if err != nil {
			log.Printf("scheduled publisher: %v", err)
			return
		}
		if n > 0 {
			log.Printf("scheduled publisher: %d article(s) programmé(s) publié(s)", n)
		}
	}

	run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}
