package seed

// Validation du seed Go : sur un schéma vierge (appliqué par testutil), Run
// doit créer toutes les données de démo (ids fixes e2e inclus) et être
// idempotent (re-run sans doublons).

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

func count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	if err := poolTest.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", query, err)
	}
	return n
}

// TestRunTopKeepAdmin vérifie que la régénération « top du top » recrée bien
// l'admin superadmin canonique (aligné sur Supabase Auth) après le wipe : sans
// cela, GET /v1/me → 404 pour admin@qoe.fi et le RBAC superadmin → 403.
func TestRunTopKeepAdmin(t *testing.T) {
	ctx := context.Background()
	// Petit profil pour que le test reste rapide.
	if _, err := RunTop(ctx, poolTest, TopOptions{
		Users: 20, Articles: 4, Posts: 10, ReadingSessions: 5,
		CreatorsRatio: 0.4, PremiumRatio: 0.1,
	}); err != nil {
		t.Fatalf("RunTop: %v", err)
	}

	// L'admin superadmin aligné Supabase Auth doit exister (id fixe).
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE id = $1 AND role = 'superadmin' AND email = 'admin@qoe.fi'`, AdminUserID); n != 1 {
		t.Fatalf("admin superadmin après RunTop = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND "isCertified"`, AdminPubID); n != 1 {
		t.Fatalf("publication admin certifiée après RunTop = %d, attendu 1", n)
	}
}

func TestSeedRun(t *testing.T) {
	ctx := context.Background()
	if err := Run(ctx, poolTest); err != nil {
		t.Fatalf("Run: %v", err)
	}

	// IDs fixes e2e présents.
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE id = $1`, AdminUserID); n != 1 {
		t.Fatalf("admin user = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND "isCertified"`, AdminPubID); n != 1 {
		t.Fatalf("publication admin certifiée = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND type = 'MEDIA'`, MediaPubID); n != 1 {
		t.Fatalf("publication média = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "MediaMember" WHERE "mediaId" = $1`, MediaID); n != 4 {
		t.Fatalf("membres média = %d, attendu 4", n)
	}

	// Contenu.
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "publicationId" = $1 AND published`, AdminPubID); n != 4 {
		t.Fatalf("articles admin publiés = %d, attendu 4 (3 démo + 1 premium)", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "publicationId" = $1`, MediaPubID); n != 1 {
		t.Fatalf("articles média = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE slug = 'essai-premium-souverainete' AND "isPremium"`); n != 1 {
		t.Fatalf("article premium = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "NavigationItem" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("navigation = %d, attendu 4", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "SocialLink" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("socialLinks = %d, attendu 4", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Category" WHERE "publicationId" = $1`, AdminPubID); n != 2 {
		t.Fatalf("catégories = %d, attendu 2", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "SystemConfig"`); n != 18 {
		t.Fatalf("systemConfigs = %d, attendu 18", n)
	}

	// Idempotence : un second run ne crée pas de doublons.
	before := count(t, `SELECT COUNT(*) FROM "Article"`)
	if err := Run(ctx, poolTest); err != nil {
		t.Fatalf("Run (2e): %v", err)
	}
	after := count(t, `SELECT COUNT(*) FROM "Article"`)
	if before != after {
		t.Fatalf("doublons articles: %d → %d", before, after)
	}
	if n := count(t, `SELECT COUNT(*) FROM "NavigationItem" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("navigation après re-run = %d, attendu 4", n)
	}
}
