package starterpacks

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func seedStarterPacks(t *testing.T) (authorID, memberID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"StarterPack", "StarterPackItem", "Follows", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	authorID = "00000000-0000-0000-0000-0000000000a1"
	memberID = "00000000-0000-0000-0000-0000000000a2"
	for _, u := range []struct{ id, email, username string }{
		{authorID, "pack.author@test.dev", "packauthor"},
		{memberID, "pack.member@test.dev", "packmember"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.email, u.username); err != nil {
			t.Fatalf("user: %v", err)
		}
	}
	// Publication personnelle du membre (cible du follow-all).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_member_pack', 'PERSONAL', 'Member Pub', 'member-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_member_pack' WHERE id = $1`, memberID); err != nil {
		t.Fatalf("link: %v", err)
	}
	return authorID, memberID
}

func TestStarterPackLifecycle(t *testing.T) {
	authorID, memberID := seedStarterPacks(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Création (résout la publication personnelle de l'auteur).
	pack, err := svc.Create(ctx, authorID, "  Packs Go  ", sp("Pour les devs"), sp("🐹"), []string{memberID, memberID})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if pack.Title != "Packs Go" {
		t.Fatalf("title = %q", pack.Title)
	}
	if len(pack.Items) != 1 {
		t.Fatalf("items = %d, want 1 (dédup)", len(pack.Items))
	}
	if pack.Publication.ID == "" {
		t.Fatal("publication vide")
	}

	// Lecture détail.
	got, err := svc.Get(ctx, pack.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Title != pack.Title || got.Count != 1 {
		t.Fatalf("detail = %+v", got)
	}

	// Liste.
	packs, err := svc.List(ctx, 20, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(packs) != 1 {
		t.Fatalf("list = %d, want 1", len(packs))
	}

	// Follow-all : l'auteur suit la publication du membre.
	count, err := svc.FollowAll(ctx, pack.ID, authorID)
	if err != nil {
		t.Fatalf("FollowAll: %v", err)
	}
	if count != 1 {
		t.Fatalf("followedCount = %d, want 1", count)
	}

	// Idempotent.
	count, err = svc.FollowAll(ctx, pack.ID, authorID)
	if err != nil {
		t.Fatalf("FollowAll 2: %v", err)
	}
	if count != 0 {
		t.Fatalf("followedCount 2 = %d, want 0", count)
	}

	// Pack introuvable.
	if _, err := svc.Get(ctx, "nope"); err == nil {
		t.Fatal("Get(unknown) should fail")
	}
}

func sp(s string) *string { return &s }
