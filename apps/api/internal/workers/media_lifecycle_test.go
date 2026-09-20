package workers

// Cycle de vie des médias : un passage purge les orphelins expirés
// (storage + DB) et conserve les assets référencés.
// Requiert Docker/testcontainers (CI) via poolTest.

import (
	"context"
	"testing"
	"time"

	"github.com/qoefi/api/internal/modules/mediaassets"
)

type fakeMediaDeleter struct {
	deleted []string
}

func (f *fakeMediaDeleter) Delete(_ context.Context, bucket, path string) error {
	f.deleted = append(f.deleted, bucket+"/"+path)
	return nil
}

func seedMediaLifecycle(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "MediaAsset" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000c1', 'media-life@test.dev', 'medialife', 'Media', 'creator', now(), now())
		 ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("user: %v", err)
	}
	// Orphelin expiré (jamais attaché) → doit être purgé.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaAsset" (id, sha256, url, "storagePath", bucket, "mimeType", "sizeBytes",
		                           "ownerId", "targetType", status, "purgeDueAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000d1', 'sha-life-orphan',
		         'https://cdn.qoe.fi/life/orphan.webp', 'articles/life/orphan.webp',
		         'articles-media', 'image/webp', 100,
		         '00000000-0000-0000-0000-0000000000c1', 'ARTICLE_BODY',
		         'DRAFT_ORPHAN', now() - interval '1 hour', now())`); err != nil {
		t.Fatalf("orphan: %v", err)
	}
	// Orphelin frais (TTL non échue) → conservé.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaAsset" (id, sha256, url, "storagePath", bucket, "mimeType", "sizeBytes",
		                           "ownerId", "targetType", status, "purgeDueAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000d2', 'sha-life-fresh',
		         'https://cdn.qoe.fi/life/fresh.webp', 'articles/life/fresh.webp',
		         'articles-media', 'image/webp', 100,
		         '00000000-0000-0000-0000-0000000000c1', 'ARTICLE_BODY',
		         'DRAFT_ORPHAN', now() + interval '3 days', now())`); err != nil {
		t.Fatalf("fresh: %v", err)
	}
}

func TestRunMediaLifecycleOnce_PurgesExpiredOrphan(t *testing.T) {
	ctx := context.Background()
	seedMediaLifecycle(t, ctx)

	svc := mediaassets.NewService(poolTest)
	del := &fakeMediaDeleter{}
	_, _, purged, err := runMediaLifecycleOnce(ctx, poolTest, svc, del, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if purged != 1 {
		t.Fatalf("purgés = %d, attendu 1", purged)
	}
	if len(del.deleted) != 1 || del.deleted[0] != "articles-media/articles/life/orphan.webp" {
		t.Fatalf("storage supprimé = %v", del.deleted)
	}

	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT status::text FROM "MediaAsset" WHERE id = '00000000-0000-0000-0000-0000000000d1'`).Scan(&status); err != nil {
		t.Fatalf("statut orphelin: %v", err)
	}
	if status != "PURGED" {
		t.Fatalf("orphelin = %s, attendu PURGED", status)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT status::text FROM "MediaAsset" WHERE id = '00000000-0000-0000-0000-0000000000d2'`).Scan(&status); err != nil {
		t.Fatalf("statut frais: %v", err)
	}
	if status != "DRAFT_ORPHAN" {
		t.Fatalf("frais = %s, attendu DRAFT_ORPHAN conservé", status)
	}
}

func TestRunMediaLifecycle_Cancelled(t *testing.T) {
	// Contexte annulé : le passage initial s'exécute (erreur loggée, pas de
	// panic) puis la boucle sort immédiatement.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	RunMediaLifecycle(ctx, poolTest, mediaassets.NewService(poolTest), &fakeMediaDeleter{},
		time.Microsecond, 7*24*time.Hour)
}
