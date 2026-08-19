package settings

import (
	"context"
	"log"
	"os"
	"strings"
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

func seedSettings(t *testing.T) *testutil.SettingsFixtures {
	t.Helper()
	fx, err := testutil.SeedSettings(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	return fx
}

// ─── Génération de clés API ────────────────────────────────────────────

func TestGenerateApiKey_ScopesFiltered(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Scopes valides + un invalide → seul le valide est retenu.
	apiKey, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé CMS", []string{"READ", "HACKED"})
	if err != nil {
		t.Fatalf("GenerateApiKey: %v", err)
	}
	if !strings.HasPrefix(apiKey, "qoe_live_") {
		t.Fatalf("clé = %q, attendu préfixe qoe_live_", apiKey)
	}
	if len(apiKey) != len("qoe_live_")+32 {
		t.Fatalf("clé = %q, longueur inattendue", apiKey)
	}

	// La clé est en base, hashée (jamais en clair).
	var storedScopes []string
	var keyHash, prefix string
	err = poolTest.QueryRow(ctx,
		`SELECT "keyHash", "keyPrefix", scopes FROM "ApiKey" WHERE "userId" = $1`,
		fx.OwnerID,
	).Scan(&keyHash, &prefix, &storedScopes)
	if err != nil {
		t.Fatalf("clé en base: %v", err)
	}
	if prefix != "qoe_live" {
		t.Fatalf("keyPrefix = %q", prefix)
	}
	if len(keyHash) != 64 {
		t.Fatalf("keyHash = %q, attendu sha256 hex (64)", keyHash)
	}
	// Seul READ est retenu (HACKED filtré).
	if len(storedScopes) != 1 || storedScopes[0] != "READ" {
		t.Fatalf("scopes = %v, attendu [READ]", storedScopes)
	}
}

func TestGenerateApiKey_NotApproved_Error(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// viewer n'est pas approved → refus.
	_, err := svc.GenerateApiKey(ctx, fx.ViewerID, "Clé", []string{"READ"})
	if err == nil || !strings.Contains(err.Error(), "approuvée") {
		t.Fatalf("GenerateApiKey(viewer) = %v, attendu erreur d'approbation", err)
	}
}

func TestGenerateApiKey_EmptyScopes_FullAccess(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// scopes vide = rétro-compatibilité : accès complet (les 3).
	_, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé legacy", nil)
	if err != nil {
		t.Fatalf("GenerateApiKey(nil scopes): %v", err)
	}
	var scopes []string
	err = poolTest.QueryRow(ctx,
		`SELECT scopes FROM "ApiKey" WHERE "userId" = $1`,
		fx.OwnerID,
	).Scan(&scopes)
	if err != nil {
		t.Fatalf("scopes: %v", err)
	}
	if len(scopes) != 3 {
		t.Fatalf("scopes = %v, attendu accès complet [READ WRITE ANALYTICS]", scopes)
	}
}

func TestGenerateApiKey_OnlyInvalidScopes_Error(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	_, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé", []string{"NOPE", "HACK"})
	if err == nil || !strings.Contains(err.Error(), "au moins un scope") {
		t.Fatalf("GenerateApiKey(invalid only) = %v, attendu erreur scopes", err)
	}
}

func TestRevokeApiKey_OnlyOwnKey(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Crée 2 clés pour owner, puis supprime par ID.
	_, _ = svc.GenerateApiKey(ctx, fx.OwnerID, "Clé 1", []string{"READ"})
	_, _ = svc.GenerateApiKey(ctx, fx.OwnerID, "Clé 2", []string{"WRITE"})

	var ids []string
	rows, err := poolTest.Query(ctx, `SELECT id FROM "ApiKey" WHERE "userId" = $1 ORDER BY "createdAt"`, fx.OwnerID)
	if err != nil {
		t.Fatalf("liste clés: %v", err)
	}
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	if len(ids) != 2 {
		t.Fatalf("clés = %d, attendu 2", len(ids))
	}

	// Révoquer la clé du viewer (n'appartient pas) → ne doit rien supprimer.
	if err := svc.RevokeApiKey(ctx, fx.ViewerID, ids[0]); err != nil {
		t.Fatalf("RevokeApiKey(viewer, clé owner): %v", err)
	}
	var remain int
	_ = poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "ApiKey" WHERE "userId" = $1`, fx.OwnerID).Scan(&remain)
	if remain != 2 {
		t.Fatalf("restantes = %d, attendu 2 (la clé d'autrui n'est pas supprimée)", remain)
	}

	// Le propriétaire peut révoquer la sienne.
	if err := svc.RevokeApiKey(ctx, fx.OwnerID, ids[0]); err != nil {
		t.Fatalf("RevokeApiKey(owner): %v", err)
	}
	_ = poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "ApiKey" WHERE "userId" = $1`, fx.OwnerID).Scan(&remain)
	if remain != 1 {
		t.Fatalf("restantes = %d, attendu 1 après révocation", remain)
	}
}

// ─── RBAC authorizeSettings ────────────────────────────────────────────

func TestAuthorizeSettings_Roles(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// owner (publication personnelle) → autorisé.
	if err := svc.authorizeSettings(ctx, fx.OwnerID, fx.PubID); err != nil {
		t.Fatalf("owner doit être autorisé: %v", err)
	}
	// editor avec override manage_settings → autorisé sur la publication média.
	if err := svc.authorizeSettings(ctx, fx.EditorID, fx.MediaPubID); err != nil {
		t.Fatalf("editor (override) doit être autorisé: %v", err)
	}
	// viewer sans la permission → refusé.
	if err := svc.authorizeSettings(ctx, fx.ViewerID, fx.MediaPubID); err == nil {
		t.Fatal("viewer ne doit pas être autorisé (pas de manage_settings)")
	}
	// owner sur une publication qui n'est pas la sienne → refusé.
	if err := svc.authorizeSettings(ctx, fx.OwnerID, fx.MediaPubID); err == nil {
		t.Fatal("owner ne doit pas gérer les settings d'une publication étrangère")
	}
}

// ─── Sous-domaines ─────────────────────────────────────────────────────

func TestCheckSubdomain(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	cases := []struct {
		name      string
		subdomain string
		available bool
	}{
		{"valide", "mon-blog", true},
		{"réservé", "admin", false},
		{"déjà pris", "deja-pris", false}, // subdomain de la publication média
		{"caractères invalides", "Mon Blog!", false},
		{"trop court", "ab", false},
		{"trop long", strings.Repeat("a", 31), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			available, reason := svc.CheckSubdomain(ctx, tc.subdomain)
			if available != tc.available {
				t.Fatalf("available = %v (reason=%q), attendu %v", available, reason, tc.available)
			}
		})
	}
	_ = fx
}

func TestUpdateSubdomain_Owner_Success(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	if err := svc.UpdateSubdomain(ctx, fx.OwnerID, fx.PubID, "nouveau-blog"); err != nil {
		t.Fatalf("UpdateSubdomain: %v", err)
	}
	var subdomain *string
	_ = poolTest.QueryRow(ctx,
		`SELECT "subdomain" FROM "Publication" WHERE id = $1`, fx.PubID,
	).Scan(&subdomain)
	if subdomain == nil || *subdomain != "nouveau-blog" {
		t.Fatalf("subdomain = %v, attendu nouveau-blog", subdomain)
	}
}

func TestUpdateSubdomain_ForbiddenForViewer(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	if err := svc.UpdateSubdomain(ctx, fx.ViewerID, fx.MediaPubID, "hijack"); err == nil {
		t.Fatal("viewer ne doit pas pouvoir changer le sous-domaine")
	}
}

// ─── Onboarding ────────────────────────────────────────────────────────

func TestCompleteOnboarding_CreatesPublication(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// viewer n'a pas de publication personnelle → l'onboarding en crée une.
	if err := svc.CompleteOnboarding(ctx, fx.ViewerID, OnboardingInput{
		Name:        "Nouveau Créateur",
		HeroText:    "Bonjour",
		Subdomain:   "nouveau-crea",
		LayoutStyle: "minimal",
	}); err != nil {
		t.Fatalf("CompleteOnboarding: %v", err)
	}

	// Le user est créator + publication liée.
	var role string
	var pubID *string
	_ = poolTest.QueryRow(ctx, `SELECT role, "publicationId" FROM "User" WHERE id = $1`, fx.ViewerID).
		Scan(&role, &pubID)
	if role != "creator" {
		t.Fatalf("role = %q, attendu creator", role)
	}
	if pubID == nil || *pubID == "" {
		t.Fatal("publication personnelle non liée après onboarding")
	}
}

func TestCompleteOnboarding_UpdatesExisting(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// owner a déjà une publication personnelle → sync (pas de doublon).
	if err := svc.CompleteOnboarding(ctx, fx.OwnerID, OnboardingInput{
		Name:        "Owner Renommé",
		Subdomain:   "owner-blog",
		LayoutStyle: "minimal",
	}); err != nil {
		t.Fatalf("CompleteOnboarding(existing): %v", err)
	}
	var pubs int
	_ = poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Publication"`).Scan(&pubs)
	if pubs != 2 { // pub owner + pub média
		t.Fatalf("publications = %d, attendu 2 (pas de doublon)", pubs)
	}
}
