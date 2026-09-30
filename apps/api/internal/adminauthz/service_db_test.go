package adminauthz

// ── Résolution et garde sur une base réelle ────────────────────────────
//
// `service_test.go` exerce la logique avec une doublure ; ici, c'est
// `rolesQuery` et `capabilitiesQuery` que l'on fait tourner pour de vrai, avec
// des attributions réelles : union avec la colonne historique, échéances,
// matrices semées, cache et invalidation, puis le garde monté sur ces résultats.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// TestServiceLive_LegacyColumnUnionsWithGrantedRoles — `User."role"` reste
// souverain et s'UNIONNE aux rôles attribués : promouvoir par la colonne suffit,
// ajouter un rôle nommé s'ajoute.
func TestServiceLive_LegacyColumnUnionsWithGrantedRoles(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	svc := db.service()

	// Legacy + rôle nommé : tout, plus la trace des deux rôles.
	both := db.createUser(t, uuid(1), "both@test.dev", "superadmin")
	db.grant(t, both, RoleSupport, nil)
	access := db.resolve(t, svc, both)
	if !access.IsSuperadmin() {
		t.Fatal("superadmin historique non reconnu")
	}
	if len(access.CapabilityKeys()) != len(Capabilities()) {
		t.Fatalf("= %d capacités, attendu %d", len(access.CapabilityKeys()), len(Capabilities()))
	}
	if got := access.RoleKeys(); len(got) != 2 || got[0] != RoleSuperadmin || got[1] != RoleSupport {
		t.Fatalf("rôles = %v, attendu [superadmin support]", got)
	}

	// Deux rôles nommés sans legacy : l'union exacte des deux ensembles.
	union := db.createUser(t, uuid(2), "union@test.dev", "user")
	db.grant(t, union, RoleSupport, nil)
	db.grant(t, union, RoleAnalyst, nil)
	want := RoleSet(RoleSupport).Union(RoleSet(RoleAnalyst))
	got := db.resolve(t, svc, union).Capabilities
	if len(got) != len(want) {
		t.Fatalf("union = %v, attendu %v", got.Keys(), want.Keys())
	}
	for c := range want {
		if !got.Has(c) {
			t.Errorf("capacité %q manquante de l'union", c)
		}
	}

	// Rôle superadmin ATTRIBUÉ (sans la colonne legacy) : vaut aussi tout.
	granted := db.createUser(t, uuid(3), "granted-super@test.dev", "user")
	db.grant(t, granted, RoleSuperadmin, nil)
	access = db.resolve(t, svc, granted)
	if !access.IsSuperadmin() || len(access.CapabilityKeys()) != len(Capabilities()) {
		t.Fatalf("rôle superadmin attribué = %v", access.CapabilityKeys())
	}

	// Aucun rôle : rien (listes vides, jamais nil).
	bare := db.createUser(t, uuid(4), "bare@test.dev", "user")
	access = db.resolve(t, svc, bare)
	if !access.Capabilities.Empty() || access.RoleKeys() == nil || len(access.RoleKeys()) != 0 {
		t.Fatalf("compte sans rôle = %+v", access)
	}
	if access.IsSuperadmin() {
		t.Fatal("compte sans rôle vu comme superadmin")
	}
}

// TestServiceLive_ExpiryRules — NULL n'expire jamais, une échéance future
// accorde, une échéance passée n'accorde plus rien (et disparaît des rôles).
func TestServiceLive_ExpiryRules(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	svc := db.service()

	never := db.createUser(t, uuid(1), "never@test.dev", "user")
	db.grant(t, never, RoleSupport, nil)

	future := db.createUser(t, uuid(2), "future@test.dev", "user")
	if _, err := db.pool.Exec(context.Background(),
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, 'support', now(), now() + interval '1 day')`, future); err != nil {
		t.Fatalf("attribution future: %v", err)
	}

	expired := db.createUser(t, uuid(3), "expired@test.dev", "user")
	if _, err := db.pool.Exec(context.Background(),
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, 'support', now() - interval '2 days', now() - interval '1 day')`, expired); err != nil {
		t.Fatalf("attribution expirée: %v", err)
	}

	for _, tc := range []struct {
		name   string
		userID string
		grants bool
	}{
		{"sans fin", never, true},
		{"échéance future", future, true},
		{"échéance passée", expired, false},
	} {
		access := db.resolve(t, svc, tc.userID)
		if got := access.Has(SupportRead); got != tc.grants {
			t.Errorf("%s : SupportRead = %v, attendu %v", tc.name, got, tc.grants)
		}
		if tc.grants {
			if len(access.RoleKeys()) != 1 || access.RoleKeys()[0] != RoleSupport {
				t.Errorf("%s : rôles = %v", tc.name, access.RoleKeys())
			}
			continue
		}
		if len(access.RoleKeys()) != 0 {
			t.Errorf("%s : rôle expiré encore listé (%v)", tc.name, access.RoleKeys())
		}
		if !access.Capabilities.Empty() {
			t.Errorf("%s : capacités accordées par un rôle expiré (%v)", tc.name, access.CapabilityKeys())
		}
	}

	// Échéance à l'instant même : la règle est « strictement après maintenant »,
	// donc plus d'accès (une échéance passée dès l'écriture).
	boundary := db.createUser(t, uuid(4), "boundary@test.dev", "user")
	if _, err := db.pool.Exec(context.Background(),
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, 'support', now() - interval '1 second', CURRENT_TIMESTAMP)`, boundary); err != nil {
		t.Fatalf("attribution limite: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if access := db.resolve(t, svc, boundary); access.Has(SupportRead) {
		t.Fatal("une échéance atteinte accorde encore la capacité")
	}

	// Une capacité expirée ne survit pas non plus au cache d'un rôle encore
	// valide : l'échéance est évaluée par le SQL à chaque relecture.
	mixed := db.createUser(t, uuid(5), "mixed@test.dev", "user")
	db.grant(t, mixed, RoleSupport, nil)
	if _, err := db.pool.Exec(context.Background(),
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, 'content', now() - interval '2 days', now() - interval '1 day')`, mixed); err != nil {
		t.Fatalf("attribution mixte: %v", err)
	}
	access := db.resolve(t, svc, mixed)
	if !access.Has(SupportRead) || access.Has(ContentWrite) {
		t.Fatalf("attribution mixte mal résolue : %v", access.CapabilityKeys())
	}
}

// TestServiceLive_SeededRolesBehaveAsClaimed — les sept rôles semés, résolus
// depuis la base, valent exactement la matrice Go : support ne peut pas écrire
// les abonnements, analyst n'écrit rien, superadmin passe partout.
func TestServiceLive_SeededRolesBehaveAsClaimed(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	svc := db.service()

	for i, role := range Roles() {
		userID := db.createUser(t, uuid(0x40+i), role+"-live@test.dev", "user")
		db.grant(t, userID, role, nil)

		access := db.resolve(t, svc, userID)
		want := RoleSet(role)
		got := access.Capabilities
		if len(got) != len(want) {
			t.Errorf("rôle %s : %d capacités en base, %d en Go (%v)", role, len(got), len(want), got.Keys())
		}
		for c := range want {
			if !got.Has(c) {
				t.Errorf("rôle %s : %q manquante à l'exécution", role, c)
			}
		}
		for c := range got {
			if !want.Has(c) {
				t.Errorf("rôle %s : %q accordée par la base mais pas par le Go", role, c)
			}
		}
		if got := access.RoleKeys(); len(got) != 1 || got[0] != role {
			t.Errorf("rôle %s : rôles résolus = %v", role, got)
		}
	}

	// Les trois affirmations du plan, mesurées sur la base.
	support := db.createUser(t, uuid(0x80), "support-assert@test.dev", "user")
	db.grant(t, support, RoleSupport, nil)
	supportAccess := db.resolve(t, svc, support)
	if !supportAccess.Has(SubscriptionsRead) {
		t.Error("support : ne peut pas lire les abonnements")
	}
	if supportAccess.Has(SubscriptionsWrite) {
		t.Error("support : peut ÉCRIRE les abonnements")
	}
	if !supportAccess.Has(SupportWrite) {
		t.Error("support : ne peut pas traiter un dossier support")
	}

	analyst := db.createUser(t, uuid(0x81), "analyst-assert@test.dev", "user")
	db.grant(t, analyst, RoleAnalyst, nil)
	analystAccess := db.resolve(t, svc, analyst)
	for c := range analystAccess.Capabilities {
		if !c.IsReadOnly() {
			t.Errorf("analyst : capacité d'écriture %q", c)
		}
	}
	if len(analystAccess.CapabilityKeys()) != len(ReadOnlyCapabilities()) {
		t.Errorf("analyst : %d capacités, %d capacités de lecture au vocabulaire",
			len(analystAccess.CapabilityKeys()), len(ReadOnlyCapabilities()))
	}

	super := db.createUser(t, uuid(0x82), "super-assert@test.dev", "user")
	db.grant(t, super, RoleSuperadmin, nil)
	superAccess := db.resolve(t, svc, super)
	if len(superAccess.CapabilityKeys()) != len(Capabilities()) {
		t.Errorf("superadmin : %d capacités, attendu %d", len(superAccess.CapabilityKeys()), len(Capabilities()))
	}
}

// TestServiceLive_CacheAndInvalidation — le cache de 30 s sert la console, mais
// ni un retrait de rôle ni une échéance ne peuvent rester collés : Invalidate
// prend effet immédiatement, et le TTL finit par recharger de lui-même.
func TestServiceLive_CacheAndInvalidation(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	svc := db.service()
	userID := db.createUser(t, uuid(1), "cache@test.dev", "user")
	db.grant(t, userID, RoleSupport, nil)

	if access := db.resolve(t, svc, userID); access.Has(ContentWrite) {
		t.Fatal("content.write déjà accordée")
	}

	// Nouveau rôle en base : le cache doit encore servir l'ancien état.
	db.grant(t, userID, RoleContent, nil)
	if access := db.resolve(t, svc, userID); access.Has(ContentWrite) {
		t.Fatal("le cache a été contourné : le rôle ajouté est déjà visible")
	}

	// Invalidate : effet immédiat.
	svc.Invalidate(userID)
	access := db.resolve(t, svc, userID)
	if !access.Has(ContentWrite) {
		t.Fatalf("rôle ajouté invisible après Invalidate : %v", access.CapabilityKeys())
	}
	if !access.Has(SupportRead) {
		t.Error("le rôle initial a disparu")
	}

	// Retrait d'un rôle : là encore, Invalidate évite de laisser un droit
	// fantôme pendant 30 s.
	if _, err := db.pool.Exec(context.Background(),
		`DELETE FROM "AdminUserRole" WHERE "userId" = $1 AND "roleKey" = 'content'`, userID); err != nil {
		t.Fatalf("retrait du rôle: %v", err)
	}
	if access := db.resolve(t, svc, userID); !access.Has(ContentWrite) {
		t.Fatal("le retrait est visible sans Invalidate : le cache ne sert plus")
	}
	svc.Invalidate(userID)
	if access := db.resolve(t, svc, userID); access.Has(ContentWrite) {
		t.Fatal("droit fantôme après retrait + Invalidate")
	}

	// TTL court : le rechargement se fait tout seul, sans Invalidate.
	previous := cacheTTL
	cacheTTL = 20 * time.Millisecond
	t.Cleanup(func() { cacheTTL = previous })

	_ = db.resolve(t, svc, userID)
	db.grant(t, userID, RoleContent, nil)
	time.Sleep(60 * time.Millisecond)
	if access := db.resolve(t, svc, userID); !access.Has(ContentWrite) {
		t.Fatal("le cache n'a pas expiré après le TTL")
	}
}

// TestGuardLive_EnforcesRealLookup — le garde monté sur le service réel, en
// mode refus : c'est la chaîne complète (route → capacité → SQL → décision)
// telle qu'elle tourne en production une fois le flag basculé.
func TestGuardLive_EnforcesRealLookup(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	svc := db.service()
	svc.SetModeResolver(func(context.Context) bool { return true })

	support := db.createUser(t, uuid(1), "support-guard@test.dev", "user")
	db.grant(t, support, RoleSupport, nil)
	analyst := db.createUser(t, uuid(2), "analyst-guard@test.dev", "user")
	db.grant(t, analyst, RoleAnalyst, nil)
	super := db.createUser(t, uuid(3), "super-guard@test.dev", "superadmin")

	r := chi.NewRouter()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	r.With(Require(svc, SubscriptionsWrite)).Method(http.MethodPost, "/v1/admin/subscriptions/grants", ok)
	r.With(Require(svc, SupportWrite)).Method(http.MethodPost, "/v1/admin/support/tickets/{id}/assign", ok)
	r.With(Require(svc, SelfRead)).Method(http.MethodGet, "/v1/admin/me", ok)

	call := func(method, path, userID string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		if userID != "" {
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
			req = req.WithContext(ctx)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// Support : refuse l'octroi d'abonnement, avec le code transporté et la
	// capacité nommée ; autorise le traitement d'un dossier support ; autorise
	// la lecture de son propre accès.
	w := call(http.MethodPost, "/v1/admin/subscriptions/grants", support)
	if w.Code != http.StatusForbidden {
		t.Fatalf("support → octroi abonnement = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != "deny_missing_capability" {
		t.Errorf("X-Qoe-Authz-Code = %q", got)
	}
	if body := w.Body.String(); !strings.Contains(body, string(SubscriptionsWrite)) {
		t.Errorf("capacité manquante non nommée : %s", body)
	}
	if w := call(http.MethodPost, "/v1/admin/support/tickets/x/assign", support); w.Code != http.StatusOK {
		t.Fatalf("support → traitement dossier = %d, attendu 200", w.Code)
	}
	if w := call(http.MethodGet, "/v1/admin/me", support); w.Code != http.StatusOK {
		t.Fatalf("support → /me = %d, attendu 200", w.Code)
	}

	// Analyst : aucune écriture, y compris le dossier support.
	if w := call(http.MethodPost, "/v1/admin/support/tickets/x/assign", analyst); w.Code != http.StatusForbidden {
		t.Fatalf("analyst → traitement dossier = %d, attendu 403", w.Code)
	}
	if w := call(http.MethodPost, "/v1/admin/subscriptions/grants", analyst); w.Code != http.StatusForbidden {
		t.Fatalf("analyst → octroi abonnement = %d, attendu 403", w.Code)
	}

	// Superadmin (colonne legacy) : passe les trois.
	for _, tc := range []struct{ method, path string }{
		{http.MethodPost, "/v1/admin/subscriptions/grants"},
		{http.MethodPost, "/v1/admin/support/tickets/x/assign"},
		{http.MethodGet, "/v1/admin/me"},
	} {
		if w := call(tc.method, tc.path, super); w.Code != http.StatusOK {
			t.Fatalf("superadmin %s %s = %d, attendu 200", tc.method, tc.path, w.Code)
		}
	}

	// Anonyme : 401 avant toute lecture de base.
	if w := call(http.MethodPost, "/v1/admin/subscriptions/grants", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}

	// Le mode refus peut être coupé : le flag `authz-enforce` est le seul
	// interrupteur, et le couper rend la main aux services (défense en
	// profondeur), sans redéploiement.
	svc.SetModeResolver(func(context.Context) bool { return false })
	if w := call(http.MethodPost, "/v1/admin/subscriptions/grants", support); w.Code != http.StatusOK {
		t.Fatalf("après bascule en observation = %d, attendu 200 (mesure, pas refus)", w.Code)
	}
}
