package workers

import (
	"context"
	"testing"
	"time"
)

// TestPurgeFeatureSignalsOnce vérifie la fenêtre de rétention (180 jours) et la
// purge par lots (batchSize à 1 pour forcer plusieurs passages).
func TestPurgeFeatureSignalsOnce(t *testing.T) {
	requirePool(t)
	ctx := context.Background()

	insert := func(id string, age time.Duration) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "FeatureSignal" (id, "featureKey", kind, source, "createdAt")
			 VALUES ($1, 'retention-test', 'view', 'studio', now() - make_interval(secs => $2))`,
			id, int(age.Seconds())); err != nil {
			t.Fatalf("signal %s: %v", id, err)
		}
	}
	insert("fs_old_1", 200*24*time.Hour)
	insert("fs_old_2", 181*24*time.Hour)
	insert("fs_recent", 179*24*time.Hour)
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "FeatureSignal" WHERE id LIKE 'fs_%'`)
	})

	deleted, err := purgeFeatureSignalsOnce(ctx, poolTest, FeatureSignalRetention, 1)
	if err != nil {
		t.Fatalf("purge: %v", err)
	}
	if deleted < 2 {
		t.Fatalf("deleted = %d, attendu au moins 2", deleted)
	}

	var old, recent int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "FeatureSignal" WHERE id IN ('fs_old_1','fs_old_2')`).Scan(&old); err != nil {
		t.Fatalf("count old: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "FeatureSignal" WHERE id = 'fs_recent'`).Scan(&recent); err != nil {
		t.Fatalf("count recent: %v", err)
	}
	if old != 0 || recent != 1 {
		t.Fatalf("après purge : anciens=%d (attendu 0), récent=%d (attendu 1)", old, recent)
	}
}
