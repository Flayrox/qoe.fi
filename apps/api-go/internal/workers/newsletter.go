// Package workers — handlers de tâches asynq (newsletter fanout).
package workers

import (
	"context"
	"encoding/json"
	"log"
	"regexp"
	"strings"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/queue"
)

const newsletterBatch = 500

// NewsletterWorker distribue un article publié aux abonnés de la publication.
type NewsletterWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewNewsletterWorker(pool *pgxpool.Pool) *NewsletterWorker {
	return &NewsletterWorker{pool: pool, q: db.New(pool)}
}

// HandleArticlePublished traite TaskArticlePublished : webhooks (délégué)
// puis newsletter aux abonnés.
func (n *NewsletterWorker) HandleArticlePublished(ctx context.Context, t *asynq.Task) error {
	var p queue.ArticlePublishedPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}

	log.Printf("[newsletter] article %s (%s) — fanout pour publication %s", p.ArticleID, p.Visibility, p.PublicationID)

	offset := 0
	processed := 0
	for {
		batch, err := n.q.GetActiveSubscribersByPublication(ctx, db.GetActiveSubscribersByPublicationParams{
			PublicationId: p.PublicationID, Limit: newsletterBatch, Offset: int32(offset),
		})
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			break
		}
		for _, sub := range batch {
			log.Printf("[newsletter] → %s (premium=%v)", sub.Email, sub.IsPremium)
			processed++
		}
		offset += len(batch)
		if len(batch) < newsletterBatch {
			break
		}
	}
	log.Printf("[newsletter] terminé pour %s : %d abonnés traités", p.ArticleID, processed)
	return nil
}

// HandlePostLiked est un placeholder (futur usage : analytics temps réel).
func (n *NewsletterWorker) HandlePostLiked(ctx context.Context, t *asynq.Task) error {
	var p queue.PostLikedPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = p
	return nil
}

// stripHTML enlève les balises pour une preview texte (utile au contenu).
func stripHTML(html string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	text := re.ReplaceAllString(html, " ")
	return strings.TrimSpace(text)
}
