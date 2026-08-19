package workers

import (
	"context"
	"testing"
	"time"

	"github.com/qoefi/api-go/internal/testutil"
)

// seedScheduledArticles crée une publication + un auteur (via SeedWebhooks) et
// 3 articles : un SCHEDULED dû (scheduledAt passé), un SCHEDULED futur, un
// DRAFT sans scheduledAt. Retourne les IDs.
func seedScheduledArticles(t *testing.T) (dueID, futureID, draftID string) {
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	insert := func(id, status string, scheduledAt any) {
		t.Helper()
		if _, err := poolTest.Exec(context.Background(),
			`INSERT INTO "Article" (id, title, slug, content, published, visibility,
			                        "readingTime", status, "publicationId", "authorId",
			                        "scheduledAt", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, '<p>Test</p>', false, 'PUBLIC', 3, $4, $5, $6,
			         $7, now(), now())`,
			id, "Titre "+id, "slug-"+id, status, fx.PublicationID, fx.OwnerID, scheduledAt,
		); err != nil {
			t.Fatalf("insert %s: %v", id, err)
		}
	}

	dueID = "art_sched_due"
	futureID = "art_sched_future"
	draftID = "art_sched_draft"
	// ⚠️ "scheduledAt" est TIMESTAMP (sans timezone) : normaliser en UTC,
	// sinon l'heure locale (ex: UTC+2) décale la comparaison <= now().
	insert(dueID, "SCHEDULED", time.Now().UTC().Add(-5*time.Minute))
	insert(futureID, "SCHEDULED", time.Now().UTC().Add(time.Hour))
	insert(draftID, "DRAFT", nil)

	return dueID, futureID, draftID
}

func articleState(t *testing.T, id string) (status string, published bool) {
	t.Helper()
	err := poolTest.QueryRow(context.Background(),
		`SELECT status, published FROM "Article" WHERE id = $1`, id,
	).Scan(&status, &published)
	if err != nil {
		t.Fatalf("lire %s: %v", id, err)
	}
	return status, published
}

func TestRunScheduledPublisherOnce_PublishesDueOnly(t *testing.T) {
	dueID, futureID, draftID := seedScheduledArticles(t)

	// ac = nil : les enqueues asynq sont no-op (nil-safe), on teste la bascule DB.
	n, err := runScheduledPublisherOnce(context.Background(), poolTest, nil)
	if err != nil {
		t.Fatalf("runScheduledPublisherOnce: %v", err)
	}
	if n != 1 {
		t.Fatalf("publiés = %d, attendu 1", n)
	}

	if status, published := articleState(t, dueID); status != "PUBLISHED" || !published {
		t.Fatalf("article dû = %s/%v, attendu PUBLISHED/true", status, published)
	}
	if status, published := articleState(t, futureID); status != "SCHEDULED" || published {
		t.Fatalf("article futur = %s/%v, attendu SCHEDULED/false", status, published)
	}
	if status, published := articleState(t, draftID); status != "DRAFT" || published {
		t.Fatalf("brouillon = %s/%v, attendu DRAFT/false", status, published)
	}
}

func TestRunScheduledPublisherOnce_Idempotent(t *testing.T) {
	seedScheduledArticles(t)

	if _, err := runScheduledPublisherOnce(context.Background(), poolTest, nil); err != nil {
		t.Fatalf("1er run: %v", err)
	}
	n, err := runScheduledPublisherOnce(context.Background(), poolTest, nil)
	if err != nil {
		t.Fatalf("2e run: %v", err)
	}
	if n != 0 {
		t.Fatalf("2e run publiés = %d, attendu 0 (déjà PUBLISHED)", n)
	}
}
