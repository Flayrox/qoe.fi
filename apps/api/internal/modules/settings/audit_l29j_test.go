package settings

// =====================================================================
// 🔎 L29j — non-régression du module settings
// =====================================================================
// Chaque test décrit un défaut réel corrigé pendant l'audit L29j :
// panne de base rendue en 200/400/403 « valide », consentements stockés dans
// la configuration plateforme, écritures de remplacement non atomiques,
// clé API inexistante « révoquée », demande d'API approuvée remise en attente,
// onboarding partiel, fuite du détail d'envoi email.
//
// Les tests sont volontairement au niveau HTTP + SQL : ils compilent aussi
// contre la version d'avant correctif (rouge capturé), et vérifient l'état
// réellement persisté, pas seulement le code de statut.

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/workers"
)

// failingEmailProvider simule un fournisseur SMTP qui refuse la connexion :
// son message contient un détail d'infrastructure qui ne doit jamais sortir.
type failingEmailProvider struct{}

func (failingEmailProvider) Send(context.Context, workers.EmailMessage) error {
	return errors.New("smtp 10.0.0.5:587 refused AUTH secret-provider-token")
}

func TestL29j_ConsentPersistedOutsidePlatformConfig(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()

	body := map[string]any{"analytics": true, "personalization": false, "marketing": true, "version": "2026-11"}
	if w, _ := doJSON(t, r, "PATCH", "/v1/settings/consent", testJWT(fx.ViewerID), body); w.Code != http.StatusOK {
		t.Fatalf("PATCH consent = %d (%s)", w.Code, w.Body.String())
	}
	w, out := doJSON(t, r, "GET", "/v1/settings/consent", testJWT(fx.ViewerID), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("GET consent = %d (%s)", w.Code, w.Body.String())
	}
	if out["analytics"] != true || out["marketing"] != true || out["version"] != "2026-11" {
		t.Fatalf("consent = %v", out)
	}

	var marketing bool
	var version string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "marketing", "version" FROM "UserConsentPreference" WHERE "userId" = $1`,
		fx.ViewerID).Scan(&marketing, &version); err != nil {
		t.Fatalf("consent non persisté dans UserConsentPreference: %v", err)
	}
	if !marketing || version != "2026-11" {
		t.Fatalf("ligne consent = marketing=%v version=%q", marketing, version)
	}

	// Les preuves de consentement ne sont plus dans la configuration
	// plateforme (exposée par GET /v1/admin/system-config, effaçable par un
	// admin).
	var leaked int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT count(*)::int FROM "SystemConfig" WHERE key LIKE 'CONSENT\_%'`).Scan(&leaked); err != nil {
		t.Fatalf("systemconfig: %v", err)
	}
	if leaked != 0 {
		t.Fatalf("%d consentement(s) encore dans SystemConfig", leaked)
	}
}

func TestL29j_ConsentReadFailureIsNotSuccess(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouter(&faultQ{Queries: db.New(poolTest), fail: nil}, &faultPool{Pool: poolTest, failQueryRow: true})

	w, body := doJSON(t, r, "GET", "/v1/settings/consent", testJWT(fx.ViewerID), nil)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne de lecture consentement = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_SubdomainCheckFailureIsNotUnavailable(t *testing.T) {
	requirePool(t)
	seed(t)
	r := faultRouterFromQ(map[string]error{"CheckSubdomainExists": errBoom})

	w, body := doJSON(t, r, "GET", "/v1/settings/subdomain/check?subdomain=bougie-check", "", nil)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne du check = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_SubdomainWriteFailureIsNotValidation(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouterFromQ(map[string]error{"UpdatePublisherSubdomain": errBoom})

	w, body := doJSON(t, r, "POST", "/v1/settings/subdomain", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID, "subdomain": "panne-sous-domaine",
	})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne d'écriture sous-domaine = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_ProfilePublisherLookupFailureIsNotForbidden(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouterFromQ(map[string]error{"GetUserPersonalPublisher": errBoom})

	w, body := doJSON(t, r, "PATCH", "/v1/settings/profile", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID, "name": "Panne",
	})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne d'autorisation = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_ProfileWriteFailureIsNotValidation(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouter(&faultQ{Queries: db.New(poolTest), fail: nil}, &faultPool{Pool: poolTest, failExec: true})

	w, body := doJSON(t, r, "PATCH", "/v1/settings/profile", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID, "name": "Panne",
	})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne d'écriture profil = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_PreferencesWriteFailureIsNotValidation(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouter(&faultQ{Queries: db.New(poolTest), fail: nil}, &faultPool{Pool: poolTest, failExec: true})

	w, body := doJSON(t, r, "PATCH", "/v1/settings/preferences", testJWT(fx.ViewerID),
		map[string]any{"fontScale": 110})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne d'écriture préférences = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_ApiKeyGenerationFailureIsNotForbidden(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := faultRouterFromQ(map[string]error{"GetUserApiAccessStatus": errBoom})

	w, body := doJSON(t, r, "POST", "/v1/settings/api-keys", testJWT(fx.OwnerID),
		map[string]any{"name": "Panne", "scopes": []string{"READ"}})
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne de génération de clé = %d (%v), attendu 500", w.Code, body)
	}
}

func TestL29j_RevokeUnknownKeyIsNotFound(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()

	w, body := doJSON(t, r, "DELETE", "/v1/settings/api-keys/cle-qui-nexiste-pas", testJWT(fx.OwnerID), nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("révocation d'une clé inexistante = %d (%v), attendu 404", w.Code, body)
	}
}

func TestL29j_ApiApplicationKeepsApprovedStatus(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	if _, err := poolTest.Exec(context.Background(),
		`UPDATE "User" SET "apiAccessStatus" = 'approved' WHERE id = $1`, fx.OwnerID); err != nil {
		t.Fatalf("seed approved: %v", err)
	}
	r := newTestRouter()

	w, body := doJSON(t, r, "POST", "/v1/settings/api-application", testJWT(fx.OwnerID),
		map[string]any{"reason": "Je redemande l'accès API pour mon média."})
	if w.Code == http.StatusOK {
		t.Fatalf("re-soumission sur un accès approuvé acceptée (200) : %v", body)
	}
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "apiAccessStatus" FROM "User" WHERE id = $1`, fx.OwnerID).Scan(&status); err != nil {
		t.Fatalf("statut: %v", err)
	}
	if status != "approved" {
		t.Fatalf("statut après re-soumission = %q, attendu approved", status)
	}
}

func TestL29j_OnboardingIsAtomic(t *testing.T) {
	requirePool(t)
	seed(t)
	const freshID = "99999999-0000-0000-0000-0000000000aa"
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, freshID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'atomic@test.dev', 'atomicuser', 'Atomic', 'user', now(), now())`, freshID); err != nil {
		t.Fatalf("seed fresh user: %v", err)
	}
	r := faultRouterFromQ(map[string]error{"CreatePersonalPublisher": errBoom})

	w, body := doJSON(t, r, "POST", "/v1/settings/onboarding", testJWT(freshID),
		map[string]any{"name": "Mon Média"})
	if w.Code == http.StatusOK {
		t.Fatalf("onboarding en échec rendu 200 : %v", body)
	}
	var completed bool
	var role string
	if err := poolTest.QueryRow(ctx,
		`SELECT "hasCompletedOnboarding", role FROM "User" WHERE id = $1`, freshID).
		Scan(&completed, &role); err != nil {
		t.Fatalf("user: %v", err)
	}
	if completed || role != "user" {
		t.Fatalf("état partiel laissé après échec : completed=%v role=%q", completed, role)
	}
}

func TestL29j_OnboardingRejectsInvalidSubdomain(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter()

	w, body := doJSON(t, r, "POST", "/v1/settings/onboarding", testJWT(fx.ViewerID),
		map[string]any{"name": "Mon Média", "subdomain": "Mon Blog!"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("sous-domaine invalide accepté = %d (%v), attendu 400", w.Code, body)
	}
	var count int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT count(*)::int FROM "Publisher" WHERE "subdomain" = 'Mon Blog!'`).Scan(&count); err != nil {
		t.Fatalf("publisher: %v", err)
	}
	if count != 0 {
		t.Fatalf("sous-domaine invalide enregistré (%d)", count)
	}
}

func TestL29j_NavigationSurvivesInsertFailure(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publisherId")
		VALUES (gen_random_uuid()::text, 'Accueil', '/', 0, false, $1)`, fx.PubID); err != nil {
		t.Fatalf("seed nav: %v", err)
	}
	r := faultRouterFromQ(map[string]error{"InsertNavigationItem": errBoom})

	w, body := doJSON(t, r, "PUT", "/v1/settings/navigation", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID,
		"links":       []map[string]any{{"label": "Nouveau", "url": "/nouveau"}},
	})
	if w.Code == http.StatusOK {
		t.Fatalf("échec d'insert rendu 200 : %v", body)
	}
	var labels []string
	rows, err := poolTest.Query(ctx,
		`SELECT label FROM "NavigationItem" WHERE "publisherId" = $1 ORDER BY "order"`, fx.PubID)
	if err != nil {
		t.Fatalf("lecture nav: %v", err)
	}
	for rows.Next() {
		var l string
		if err := rows.Scan(&l); err != nil {
			rows.Close()
			t.Fatalf("scan: %v", err)
		}
		labels = append(labels, l)
	}
	rows.Close()
	if len(labels) != 1 || labels[0] != "Accueil" {
		t.Fatalf("liens après échec = %v, attendu [Accueil] (remplacement atomique)", labels)
	}
}

func TestL29j_ProfileUpdateIsAtomic(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	var before string
	if err := poolTest.QueryRow(ctx, `SELECT name FROM "Publisher" WHERE id = $1`, fx.PubID).Scan(&before); err != nil {
		t.Fatalf("nom initial: %v", err)
	}
	r := faultRouterFromQ(map[string]error{"UpdateUserOnboardingText": errBoom})

	w, body := doJSON(t, r, "PATCH", "/v1/settings/profile", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID, "name": "Nom Qui Ne Doit Pas Rester", "onboardingText": "texte",
	})
	if w.Code == http.StatusOK {
		t.Fatalf("échec partiel rendu 200 : %v", body)
	}
	var after string
	if err := poolTest.QueryRow(ctx, `SELECT name FROM "Publisher" WHERE id = $1`, fx.PubID).Scan(&after); err != nil {
		t.Fatalf("nom après: %v", err)
	}
	if after != before {
		t.Fatalf("profil modifié malgré l'échec du texte d'onboarding : %q → %q", before, after)
	}
}

func TestL29j_OnboardingSlugConflictIsValidation(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	var username string
	if err := poolTest.QueryRow(ctx, `SELECT COALESCE(username, '') FROM "User" WHERE id = $1`, fx.ViewerID).
		Scan(&username); err != nil {
		t.Fatalf("username: %v", err)
	}
	if username == "" {
		t.Skip("viewer sans username")
	}
	// Un slug déjà pris par une autre publication : l'onboarding doit refuser
	// proprement (400), pas remonter une violation d'unicité en 500.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publisher" (id, type, name, slug, "updatedAt")
		VALUES ('pub_slug_conflit', 'PERSONAL', 'Conflit', $1, now())
		ON CONFLICT (id) DO NOTHING`, username); err != nil {
		t.Fatalf("seed slug: %v", err)
	}
	r := newTestRouter()

	w, body := doJSON(t, r, "POST", "/v1/settings/onboarding", testJWT(fx.ViewerID),
		map[string]any{"name": "Mon Média"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("conflit de slug = %d (%v), attendu 400", w.Code, body)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "Publisher" WHERE id = 'pub_slug_conflit'`); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
}

func TestL29j_EmailTestErrorDoesNotLeakProviderDetail(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	r := newTestRouter(func(s *Service) {
		s.SetEmailTestSender(failingEmailProvider{}, "noreply@qoe.test")
	})

	w, _ := doJSON(t, r, "POST", "/v1/settings/email/test", testJWT(fx.OwnerID), map[string]any{
		"publisherId": fx.PubID, "locale": "fr", "template": "confirm",
	})
	if w.Code == http.StatusOK {
		t.Fatalf("envoi en échec rendu 200")
	}
	if strings.Contains(w.Body.String(), "secret-provider-token") {
		t.Fatalf("détail d'infrastructure exposé : %s", w.Body.String())
	}
}

func TestL29j_SingleActiveDeletionRequest(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()

	var indexes int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*)::int FROM pg_indexes WHERE indexname = 'AccountDeletionRequest_one_active_per_user'`).
		Scan(&indexes); err != nil {
		t.Fatalf("pg_indexes: %v", err)
	}
	if indexes != 1 {
		t.Fatalf("index d'unicité de demande active absent")
	}

	// Deux créations « simultanées » : la base garantit une seule demande
	// active, et l'API renvoie la même demande (pas de 500).
	r := newTestRouter()
	tok := testJWT(fx.ViewerID)
	w1, b1 := doJSON(t, r, "POST", "/v1/me/account-deletion-request", tok, nil)
	w2, b2 := doJSON(t, r, "POST", "/v1/me/account-deletion-request", tok, nil)
	if w1.Code != http.StatusOK || w2.Code != http.StatusOK {
		t.Fatalf("créations = %d/%d (%v / %v)", w1.Code, w2.Code, b1, b2)
	}
	if b1["id"] != b2["id"] {
		t.Fatalf("ids différents : %v / %v", b1["id"], b2["id"])
	}
	var active int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*)::int FROM "AccountDeletionRequest" WHERE "userId" = $1 AND status IN ('PENDING','PROCESSING')`,
		fx.ViewerID).Scan(&active); err != nil {
		t.Fatalf("count: %v", err)
	}
	if active != 1 {
		t.Fatalf("demandes actives = %d, attendu 1", active)
	}
}
