package imports

// Tests d'intégration du module Import (import d'articles en lot) —
// migration de apps/studio/src/app/(creator)/import/actions.ts vers Go.

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

const (
	importOwnerID  = "00000000-0000-0000-0000-0000000000b1"
	importStranger = "00000000-0000-0000-0000-0000000000b2"
	importMediaID  = "media_imp_001"
	importPubMedia = "pub_imp_media_001"
	importPubPerso = "pub_imp_perso_001"
)

// seedImport crée : une publication PERSONAL (owner), une publication MEDIA
// (owner membre), et un étranger sans aucun accès.
func seedImport(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"MediaMember", "Media", "Article", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Journal Perso', 'journal-perso', now(), now()),
		        ($2, 'MEDIA', 'Média Import', 'media-import', now(), now())`,
		importPubPerso, importPubMedia); err != nil {
		t.Fatalf("publications: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, $2, now(), now())`, importMediaID, importPubMedia); err != nil {
		t.Fatalf("media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'owner-import@test.dev', 'ownerimport', 'Owner', 'creator', $2, now(), now()),
		        ($3, 'stranger-import@test.dev', 'strangerimport', 'Étranger', 'user', NULL, now(), now())`,
		importOwnerID, importPubPerso, importStranger); err != nil {
		t.Fatalf("users: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'owner', ARRAY[]::text[], 'active', now(), now())`,
		importMediaID, importOwnerID); err != nil {
		t.Fatalf("member: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func TestImportArticles(t *testing.T) {
	ctx := context.Background()
	seedImport(t, ctx)
	svc := newTestService()

	// 2 articles nouveaux + 1 slug vide (ignoré).
	req := ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles: []ImportArticle{
			{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2},
			{Title: "Article deux", Slug: "article-deux", Content: "<p>Deux</p>", ReadingTime: 3},
			{Title: "", Slug: "", Content: "", ReadingTime: 0},
		},
	}
	created, err := svc.ImportArticles(ctx, importOwnerID, req)
	if err != nil {
		t.Fatalf("ImportArticles: %v", err)
	}
	if created != 2 {
		t.Fatalf("créés = %d, attendu 2", created)
	}

	// Re-import : dédup par slug → 0 nouveau.
	created, err = svc.ImportArticles(ctx, importOwnerID, req)
	if err != nil {
		t.Fatalf("ImportArticles (re): %v", err)
	}
	if created != 0 {
		t.Fatalf("re-import créés = %d, attendu 0 (dédup)", created)
	}

	// Nouveau slug dans le lot → 1 seul créé.
	req2 := ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles: []ImportArticle{
			{Title: "Article un", Slug: "article-un", Content: "<p>Un</p>", ReadingTime: 2},
			{Title: "Article trois", Slug: "article-trois", Content: "<p>Trois</p>", ReadingTime: 4},
		},
	}
	created, err = svc.ImportArticles(ctx, importOwnerID, req2)
	if err != nil {
		t.Fatalf("ImportArticles (mixte): %v", err)
	}
	if created != 1 {
		t.Fatalf("mixte créés = %d, attendu 1", created)
	}

	// Le créateur owner d'un média peut importer dans la publication média.
	created, err = svc.ImportArticles(ctx, importOwnerID, ImportArticlesRequest{
		PublicationID: importPubMedia,
		Articles:      []ImportArticle{{Title: "Média un", Slug: "media-un", Content: "<p>M</p>", ReadingTime: 1}},
	})
	if err != nil || created != 1 {
		t.Fatalf("import média = %d, %v (attendu 1)", created, err)
	}

	// Étranger → refus.
	if _, err := svc.ImportArticles(ctx, importStranger, ImportArticlesRequest{
		PublicationID: importPubPerso,
		Articles:      []ImportArticle{{Title: "X", Slug: "x", Content: "<p>X</p>", ReadingTime: 1}},
	}); err != errForbidden {
		t.Fatalf("import étranger = %v, attendu errForbidden", err)
	}
}
