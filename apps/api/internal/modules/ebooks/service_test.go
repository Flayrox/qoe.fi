package ebooks

// EPUBs personnels (fiche Plus P1) : quota, déduplication, isolement,
// progression. Parseur testé dans epub_test.go (pur). DB skippée sans Docker.

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/subscriptions"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

func seedUser(t *testing.T, ctx context.Context, email string) string {
	t.Helper()
	var id string
	if err := poolTest.QueryRow(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, 'eb', 'E', 'user', now(), now()) RETURNING id::text`, email).Scan(&id); err != nil {
		t.Fatalf("user: %v", err)
	}
	return id
}

func cleanupUser(t *testing.T, ctx context.Context, uid, email string) {
	t.Helper()
	poolTest.Exec(ctx, `DELETE FROM "Ebook" WHERE "ownerId" = $1::uuid`, uid)
	poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, uid)
	poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1::uuid`, uid)
}

func TestUpload_QuotaDedupIsolation(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)
	email := fmt.Sprintf("ebook-%d@t.dev", time.Now().UnixNano())
	uid := seedUser(t, ctx, email)
	defer cleanupUser(t, ctx, uid, email)

	mk := func(title string) []byte {
		t.Helper()
		return buildEpub(t, title, "Auteur", map[string]string{
			"c1.xhtml": `<html><body><p>` + title + `.</p></body></html>`,
		}, nil)
	}

	// 5 gratuits puis refus explicite (le 6e).
	for i := 0; i < FreeEbookQuota; i++ {
		if _, err := svc.Upload(ctx, uid, mk(fmt.Sprintf("Livre %d", i))); err != nil {
			t.Fatalf("upload %d/5 : %v", i+1, err)
		}
	}
	if _, err := svc.Upload(ctx, uid, mk("Livre 6")); !errors.Is(err, ErrEbookQuota) {
		t.Fatalf("6e : attendu ErrEbookQuota, obtenu %v", err)
	}
	// Octroi Plus : rouvre.
	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, uid,
		subscriptions.PlanPlus, time.Now(), nil, "staff-test", "test", time.Now()); err != nil {
		t.Fatalf("octroi : %v", err)
	}
	b, err := svc.Upload(ctx, uid, mk("Livre 6"))
	if err != nil {
		t.Fatalf("6e en Plus : %v", err)
	}
	if b.ChapterCount != 1 || b.Title != "Livre 6" {
		t.Fatalf("livre incomplet : %+v", b)
	}
	// Doublon (même octets) : 409, pas de doublon silencieux.
	if _, err := svc.Upload(ctx, uid, mk("Livre 6")); !errors.Is(err, ErrEbookDuplicate) {
		t.Fatalf("doublon : attendu ErrEbookDuplicate, obtenu %v", err)
	}
	// Isolement : un autre compte ne voit ni ne lit.
	uid2 := seedUser(t, ctx, "autre-"+email)
	defer cleanupUser(t, ctx, uid2, "autre-"+email)
	if _, err := svc.Get(ctx, uid2, b.ID); !errors.Is(err, ErrEbookNotFound) {
		t.Fatalf("autrui : attendu ErrEbookNotFound, obtenu %v", err)
	}
	if _, _, err := svc.Cover(ctx, uid2, b.ID); !errors.Is(err, ErrEbookNotFound) {
		t.Fatalf("cover autrui : attendu ErrEbookNotFound, obtenu %v", err)
	}
	if err := svc.Delete(ctx, uid2, b.ID); !errors.Is(err, ErrEbookNotFound) {
		t.Fatalf("delete autrui : attendu ErrEbookNotFound, obtenu %v", err)
	}
	// Progression bornée + reprise au paragraphe visible + lecture.
	if err := svc.SetProgress(ctx, uid, b.ID, 0, 42, 7); err != nil {
		t.Fatalf("progress : %v", err)
	}
	// Valeurs négatives ramenées à 0 (jamais rejetées : l'interface ne doit
	// pas se battre avec un clamp).
	if err := svc.SetProgress(ctx, uid, b.ID, -3, 999, -1); err != nil {
		t.Fatalf("progress négatif : %v", err)
	}
	if err := svc.SetProgress(ctx, uid, b.ID, 0, 42, 7); err != nil {
		t.Fatalf("progress : %v", err)
	}
	d, err := svc.Get(ctx, uid, b.ID)
	if err != nil || d.ProgressPct != 42 || d.ProgressParagraph != 7 || len(d.Chapters) != 1 {
		t.Fatalf("détail : %+v (%v)", d, err)
	}
	// Suppression : le détail disparaît.
	if err := svc.Delete(ctx, uid, b.ID); err != nil {
		t.Fatalf("delete : %v", err)
	}
	if _, err := svc.Get(ctx, uid, b.ID); !errors.Is(err, ErrEbookNotFound) {
		t.Fatalf("supprimé : attendu ErrEbookNotFound, obtenu %v", err)
	}
}
