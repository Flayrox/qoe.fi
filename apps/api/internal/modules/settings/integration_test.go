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

// ─── Lecture de la page settings (parité prisma.publication.findUnique include) ───

func TestGetPublicationSettings(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Relations : 1 navigation, 1 lien social, 1 article, 1 catégorie.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publicationId")
		 VALUES (gen_random_uuid()::text, 'Accueil', '/', 0, false, $1)`,
		fx.PubID); err != nil {
		t.Fatalf("navigation: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "SocialLink" (id, platform, url, "order", "publicationId")
		 VALUES (gen_random_uuid()::text, 'x', 'https://x.com/owner', 0, $1)`,
		fx.PubID); err != nil {
		t.Fatalf("social: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Category" (id, name, slug, description, "publicationId")
		 VALUES ('cat_set_1', 'Technologie', 'tech', 'desc', $1)`,
		fx.PubID); err != nil {
		t.Fatalf("catégorie: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
		                        "readingTime", status, "publicationId", "authorId", "categoryId", "createdAt", "updatedAt")
		 VALUES ('art_set_1', 'Article settings', 'article-settings', '<p>Contenu</p>', true, false, 'PUBLIC',
		         5, 'PUBLISHED', $1, $2, 'cat_set_1', now(), now())`,
		fx.PubID, fx.OwnerID); err != nil {
		t.Fatalf("article: %v", err)
	}

	pub, err := svc.GetPublicationSettings(ctx, fx.OwnerID, fx.PubID)
	if err != nil {
		t.Fatalf("GetPublicationSettings: %v", err)
	}
	if pub.Name != "Owner Blog" || pub.Slug != "owner-blog" {
		t.Fatalf("pub = %+v", pub)
	}
	if pub.User == nil || pub.User.ID != fx.OwnerID || pub.User.AdvancedSettingsMode {
		t.Fatalf("owner = %+v", pub.User)
	}
	if len(pub.Navigation) != 1 || pub.Navigation[0].Label != "Accueil" {
		t.Fatalf("navigation = %+v", pub.Navigation)
	}
	if len(pub.SocialLinks) != 1 || pub.SocialLinks[0].Platform != "x" {
		t.Fatalf("socialLinks = %+v", pub.SocialLinks)
	}
	if len(pub.Articles) != 1 || pub.Articles[0].Title != "Article settings" {
		t.Fatalf("articles = %+v", pub.Articles)
	}
	if pub.Articles[0].CreatedAt == "" {
		t.Fatalf("createdAt manquant")
	}
	if len(pub.Categories) != 1 || pub.Categories[0].Name != "Technologie" {
		t.Fatalf("categories = %+v", pub.Categories)
	}

	// Viewer sans manage_settings → refus.
	if _, err := svc.GetPublicationSettings(ctx, fx.ViewerID, fx.MediaPubID); err != errForbidden {
		t.Fatalf("viewer = %v, attendu errForbidden", err)
	}
	// Editor avec manage_settings → OK.
	if _, err := svc.GetPublicationSettings(ctx, fx.EditorID, fx.MediaPubID); err != nil {
		t.Fatalf("editor: %v", err)
	}
	// Publication inconnue → errForbidden (pas de fuite d'existence : le check
	// d'accès passe avant la lecture).
	if _, err := svc.GetPublicationSettings(ctx, fx.OwnerID, "pub_inconnue"); err != errForbidden {
		t.Fatalf("inconnue = %v, attendu errForbidden", err)
	}
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

func TestListApiKeys(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// viewer n'a aucune clé.
	keys, err := svc.ListApiKeys(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("ListApiKeys(viewer): %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("clés viewer = %d, attendu 0", len(keys))
	}

	// owner crée 2 clés (dont une sans scopes = accès complet).
	if _, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé 1", []string{"READ"}); err != nil {
		t.Fatalf("GenerateApiKey 1: %v", err)
	}
	if _, err := svc.GenerateApiKey(ctx, fx.OwnerID, "Clé 2", nil); err != nil {
		t.Fatalf("GenerateApiKey 2: %v", err)
	}

	keys, err = svc.ListApiKeys(ctx, fx.OwnerID)
	if err != nil {
		t.Fatalf("ListApiKeys(owner): %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("clés = %d, attendu 2", len(keys))
	}
	// Le hash ne fait pas partie du DTO (structure, pas seulement JSON).
	if keys[0].KeyPrefix != "qoe_live" || keys[0].CreatedAt == "" {
		t.Fatalf("clé = %+v", keys[0])
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

// ─── Préférences lecteur (userSettings) ─────────────────────────────────

// TestUserPreferences vérifie GET/PATCH /v1/settings/preferences : création
// par défaut à la lecture, puis patch validé.
func TestUserPreferences(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Lecture sans ligne → defaults créés (upsert-on-read).
	s, err := svc.GetUserSettings(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("GetUserSettings: %v", err)
	}
	if s.ProfileVisibility != "PUBLIC" || s.FontScale != 100 || s.DefaultFeed != "FOLLOWING" {
		t.Fatalf("defaults = %s/%d/%s", s.ProfileVisibility, s.FontScale, s.DefaultFeed)
	}
	if !s.AllowMentions || !s.AutoplayMedia || !s.ShowSensitiveContent {
		t.Fatalf("defaults bools = %+v", s)
	}

	// Patch validé (miroir updateAccountSettingsAction).
	upd, err := svc.UpdateUserSettings(ctx, fx.ViewerID, map[string]any{
		"profileVisibility": "FOLLOWERS",
		"fontScale":         125,
		"defaultFeed":       "DISCOVER",
		"reduceMotion":      true,
	})
	if err != nil {
		t.Fatalf("UpdateUserSettings: %v", err)
	}
	if upd.ProfileVisibility != "FOLLOWERS" || upd.FontScale != 125 || upd.DefaultFeed != "DISCOVER" || !upd.ReduceMotion {
		t.Fatalf("patch non appliqué: %+v", upd)
	}
	// Les autres valeurs restent par défaut.
	if upd.AllowMentions != true {
		t.Fatalf("allowMentions changé par erreur: %+v", upd)
	}

	// Valeur invalide → refusée, état inchangé.
	if _, err := svc.UpdateUserSettings(ctx, fx.ViewerID, map[string]any{"fontScale": 999}); err == nil {
		t.Fatalf("fontScale 999 accepté")
	}
	if _, err := svc.UpdateUserSettings(ctx, fx.ViewerID, map[string]any{"profileVisibility": "BOGUS"}); err == nil {
		t.Fatalf("profileVisibility bogus accepté")
	}
	after, _ := svc.GetUserSettings(ctx, fx.ViewerID)
	if after.FontScale != 125 || after.ProfileVisibility != "FOLLOWERS" {
		t.Fatalf("état modifié après rejet: %+v", after)
	}
}

// ─── Demande de suppression de compte ────────────────────────────────────

// TestDeletionRequest vérifie POST/GET/DELETE /v1/me/account-deletion-request :
// création idempotente, lecture, annulation.
func TestDeletionRequest(t *testing.T) {
	fx := seedSettings(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Aucune demande au départ.
	none, err := svc.GetDeletionRequest(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("GetDeletionRequest: %v", err)
	}
	if none != nil {
		t.Fatalf("demande initiale = %+v, attendu nil", none)
	}

	// Création.
	req, err := svc.CreateDeletionRequest(ctx, fx.ViewerID, "User requested account deletion from settings")
	if err != nil {
		t.Fatalf("CreateDeletionRequest: %v", err)
	}
	if req.Status != "PENDING" || req.ID == "" || req.RequestedAt == "" {
		t.Fatalf("demande = %+v", req)
	}

	// Idempotent : une seconde création renvoie la même demande (pas de doublon).
	req2, err := svc.CreateDeletionRequest(ctx, fx.ViewerID, "again")
	if err != nil {
		t.Fatalf("CreateDeletionRequest 2: %v", err)
	}
	if req2.ID != req.ID {
		t.Fatalf("ids = %s / %s, attendu identique (idempotence)", req.ID, req2.ID)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "AccountDeletionRequest" WHERE "userId" = $1`,
		fx.ViewerID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("lignes = %d (err %v), attendu 1", n, err)
	}

	// Lecture → PENDING.
	got, _ := svc.GetDeletionRequest(ctx, fx.ViewerID)
	if got == nil || got.Status != "PENDING" {
		t.Fatalf("get = %+v", got)
	}

	// Annulation → CANCELED.
	if err := svc.CancelDeletionRequest(ctx, fx.ViewerID); err != nil {
		t.Fatalf("CancelDeletionRequest: %v", err)
	}
	cancelled, _ := svc.GetDeletionRequest(ctx, fx.ViewerID)
	if cancelled == nil || cancelled.Status != "CANCELED" {
		t.Fatalf("après annulation = %+v", cancelled)
	}

	// Après annulation, une nouvelle création est possible.
	req3, err := svc.CreateDeletionRequest(ctx, fx.ViewerID, "new")
	if err != nil {
		t.Fatalf("CreateDeletionRequest 3: %v", err)
	}
	if req3.Status != "PENDING" || req3.ID == req.ID {
		t.Fatalf("nouvelle demande = %+v (ancienne %s)", req3, req.ID)
	}
}
