package workers

import (
	"context"
	"testing"
	"time"

	"github.com/qoefi/api/internal/testutil"
)

// TestPurgeReadingSessionsOnce vérifie la fenêtre de rétention et la purge par
// lots (batchSize volontairement à 1 pour forcer plusieurs passages).
func TestPurgeReadingSessionsOnce(t *testing.T) {
	requirePool(t)
	ctx := context.Background()

	fx, err := testutil.SeedWebhooks(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	const articleID = "art_retention_t"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publisherId", "authorId",
		                        "createdAt", "updatedAt")
		 VALUES ($1, 'Rétention', 'retention-sessions', '<p>x</p>', false, 'PUBLIC',
		         1, 'DRAFT', $2, $3, now(), now())`,
		articleID, fx.PublisherID, fx.OwnerID); err != nil {
		t.Fatalf("article: %v", err)
	}

	insert := func(id string, age time.Duration) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "ReadingSession" (id, "articleId", source, status, "createdAt")
			 VALUES ($1, $2, 'direct', 'READ_PARTIAL', now() - make_interval(secs => $3))`,
			id, articleID, int(age.Seconds())); err != nil {
			t.Fatalf("session %s: %v", id, err)
		}
	}
	insert("rs_old_1", 100*24*time.Hour)
	insert("rs_old_2", 95*24*time.Hour)
	insert("rs_recent", 89*24*time.Hour)

	deleted, err := purgeReadingSessionsOnce(ctx, poolTest, ReadingSessionRetention, 1)
	if err != nil {
		t.Fatalf("purge: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("deleted = %d, attendu 2", deleted)
	}

	var remaining int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "ReadingSession" WHERE "articleId" = $1`, articleID,
	).Scan(&remaining); err != nil {
		t.Fatalf("count: %v", err)
	}
	if remaining != 1 {
		t.Fatalf("sessions restantes = %d, attendu 1 (la session de 89 jours)", remaining)
	}
}
