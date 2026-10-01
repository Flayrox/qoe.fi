package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/modules/legal"
	"github.com/qoefi/api/internal/modules/placements"
)

// pathParam remplace chaque segment paramétré d'un motif par une valeur sûre :
// chi fait correspondre n'importe quel segment à un paramètre, et un « {id} »
// littéral dans l'URL ferait échouer la lecture de la requête.
var pathParam = regexp.MustCompile(`\{[^/}]+\}`)

func fillPath(pattern string) string {
	return pathParam.ReplaceAllString(pattern, "00000000-0000-0000-0000-0000000000b7")
}

// ─── Console partagée de test ──────────────────────────────────────────

// fakeLookup rend un accès fixe, pour exercer le garde et /v1/admin/me sans
// base de données.
type fakeLookup struct {
	access adminauthz.Access
	err    error
}

func (f *fakeLookup) Access(context.Context, string) (adminauthz.Access, error) {
	if f.err != nil {
		return adminauthz.Access{}, f.err
	}
	return f.access, nil
}

// enforcingLookup porte la politique d'application, comme *adminauthz.Service
// branché sur le flag `authz-enforce`.
type enforcingLookup struct{ access adminauthz.Access }

func (f *enforcingLookup) Access(context.Context, string) (adminauthz.Access, error) {
	return f.access, nil
}

func (f *enforcingLookup) Enforce(context.Context) bool { return true }

// testConsole monte la console d'administration EXACTEMENT comme cmd/server :
// un seul registre route → capacité partagé par les modules qui publient sous
// /v1/admin/* (admin, légal, placements).
func testConsole(t *testing.T, lookup adminauthz.Lookup) (*chi.Mux, *adminauthz.Console, *Handler) {
	t.Helper()
	r := chi.NewRouter()
	console := adminauthz.NewConsole(r, lookup, nil)

	h := NewHandler(NewService(nil))
	// La revue des imports n'est montée que si le service est branché (comme
	// cmd/server) : sans lui, aucune route n'existe et le walk ne les verrait
	// pas — ce qui masquerait une régression de capacité sur ces routes.
	h.SetSubscriberImports(imports.NewService(nil, nil))
	h.SetConsole(console)
	h.Register(r)

	legalHandler := legal.NewHandler(legal.NewService(nil))
	legalHandler.SetConsole(console)
	legalHandler.RegisterAdmin(r)

	placementsHandler := placements.NewHandler(placements.NewService(nil))
	placementsHandler.SetConsole(console)
	placementsHandler.RegisterAdmin(r)

	return r, console, h
}

// ─── Couverture du registre ────────────────────────────────────────────

// TestEveryAdminRouteDeclaresCapability — la garantie du socle : parcourt les
// routes RÉELLEMENT montées et échoue si une route /v1/admin/* n'a pas de
// capacité déclarée. Une route qui échapperait au registre échapperait aussi
// au garde ; c'est le bug que ce test interdit.
func TestEveryAdminRouteDeclaresCapability(t *testing.T) {
	r, console, _ := testConsole(t, nil)

	declared := map[string]adminauthz.Capability{}
	for _, rt := range console.Registry().Routes() {
		declared[rt.Key()] = rt.Capability
	}
	if len(declared) == 0 {
		t.Fatal("registre vide : aucune route déclarée")
	}

	seen := map[string]bool{}
	var missing []string
	if err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if !strings.HasPrefix(route, "/v1/admin/") {
			return nil
		}
		key := adminauthz.RouteKey(method, route)
		seen[key] = true
		if _, ok := declared[key]; !ok {
			missing = append(missing, key)
		}
		return nil
	}); err != nil {
		t.Fatalf("walk: %v", err)
	}

	if len(missing) > 0 {
		t.Fatalf("routes /v1/admin/* sans capacité déclarée : %v", missing)
	}
	// Réciproque : rien de déclaré qui ne soit monté (déclaration fantôme).
	var ghosts []string
	for _, rt := range console.Registry().Routes() {
		if !seen[rt.Key()] {
			ghosts = append(ghosts, rt.Key())
		}
	}
	if len(ghosts) > 0 {
		t.Fatalf("routes déclarées mais non montées : %v", ghosts)
	}

	// Un module oublié au câblage (légal, placements) se voit ici : chaque
	// domaine du vocabulaire doit être exigé par au moins une route montée.
	byDomain := map[string]int{}
	for _, c := range console.Registry().CapabilitiesUsed() {
		byDomain[c.Domain()]++
	}
	for _, d := range adminauthz.Domains() {
		if byDomain[d] == 0 {
			t.Errorf("aucune route ne déclare de capacité du domaine %q", d)
		}
	}
}

// TestEveryDeclaredCapabilityIsHeldBySuperadmin — superadmin passe partout : le
// rôle détient chacune des capacités exigées par les routes réellement montées.
func TestEveryDeclaredCapabilityIsHeldBySuperadmin(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	all := adminauthz.AllCapabilities()
	for _, rt := range console.Registry().Routes() {
		if !all.Has(rt.Capability) {
			t.Errorf("superadmin ne détient pas %q exigée par %s", rt.Capability, rt.Key())
		}
		if !rt.Capability.Valid() {
			t.Errorf("capacité hors vocabulaire déclarée par %s", rt.Key())
		}
	}
}

// TestEveryCapabilityIsUsedOrReserved — un droit ne doit pas exister sans
// porte : toute capacité du vocabulaire est soit exigée par une route montée,
// soit explicitement listée comme réservée (et la réserve est justifiée).
func TestEveryCapabilityIsUsedOrReserved(t *testing.T) {
	reserved := map[adminauthz.Capability]string{
		adminauthz.FlagsWrite: "les flags sont basculés depuis l'interface via Supabase (RLS), aucune route Go ne les écrit",
	}
	_, console, _ := testConsole(t, nil)
	used := map[adminauthz.Capability]bool{}
	for _, c := range console.Registry().CapabilitiesUsed() {
		used[c] = true
	}
	for _, c := range adminauthz.Capabilities() {
		if used[c] {
			continue
		}
		if _, ok := reserved[c]; !ok {
			t.Errorf("capacité %q exigée par aucune route et non déclarée réservée", c)
		}
	}
	for c := range reserved {
		if used[c] {
			t.Errorf("capacité %q déclarée réservée mais utilisée : la réserve est périmée", c)
		}
	}
}

// TestSensitiveRoutesDeclareTheRightCapability — ancrage des routes les plus
// sensibles sur la capacité prévue : le nom de capacité est le contrat entre le
// registre et la matrice de rôles.
func TestSensitiveRoutesDeclareTheRightCapability(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	cases := []struct {
		method, pattern string
		want            adminauthz.Capability
	}{
		{"GET", "/v1/admin/me", adminauthz.SelfRead},
		{"GET", "/v1/admin/dashboard", adminauthz.DashboardRead},
		{"GET", "/v1/admin/audit-log", adminauthz.AuditRead},
		{"POST", "/v1/admin/subscriptions/grants", adminauthz.SubscriptionsWrite},
		{"POST", "/v1/admin/subscriptions/grants/{id}/revoke", adminauthz.SubscriptionsWrite},
		{"PATCH", "/v1/admin/publications/{id}", adminauthz.SubscriptionsWrite},
		{"PATCH", "/v1/admin/users/{userID}", adminauthz.UsersModerate},
		{"POST", "/v1/admin/users/{userID}/revoke-sessions", adminauthz.UsersSessionsRevoke},
		{"POST", "/v1/admin/import/subscribers/{id}/decide", adminauthz.ImportsReview},
		{"GET", "/v1/admin/import/subscribers", adminauthz.ImportsRead},
		{"POST", "/v1/admin/campaigns/{id}/approve", adminauthz.CampaignsWrite},
		{"PUT", "/v1/admin/config", adminauthz.ConfigWrite},
		{"PATCH", "/v1/admin/oauth/clients/{id}", adminauthz.OAuthApprove},
		{"PATCH", "/v1/admin/api-applicants/{userID}", adminauthz.APIGrantsWrite},
		{"POST", "/v1/admin/legal/versions/{versionID}/publish", adminauthz.LegalWrite},
		{"POST", "/v1/admin/legal/consent-exports", adminauthz.ComplianceExport},
		{"GET", "/v1/admin/legal/compliance", adminauthz.ComplianceRead},
		{"GET", "/v1/admin/placements", adminauthz.WidgetsRead},
		{"POST", "/v1/admin/placements", adminauthz.WidgetsWrite},
		// Accès staff : la lecture ouvre les écrans, l'attribution est le seul
		// mouvement (motif, anti-escalade et garde-fous portés par le service).
		{"GET", "/v1/admin/access/grants", adminauthz.AccessRead},
		{"GET", "/v1/admin/access/people/{userID}", adminauthz.AccessRead},
		{"GET", "/v1/admin/access/roles", adminauthz.AccessRead},
		{"GET", "/v1/admin/access/capabilities", adminauthz.AccessRead},
		{"POST", "/v1/admin/access/grants", adminauthz.AccessGrant},
		{"POST", "/v1/admin/access/grants/{userID}/{roleKey}/revoke", adminauthz.AccessGrant},
	}
	for _, tc := range cases {
		got, ok := console.Registry().Lookup(tc.method, tc.pattern)
		if !ok {
			t.Errorf("%s %s : non déclarée", tc.method, tc.pattern)
			continue
		}
		if got != tc.want {
			t.Errorf("%s %s : capacité %q, attendu %q", tc.method, tc.pattern, got, tc.want)
		}
	}

	// Sur la vraie route d'octroi d'abonnement : support et analyst ne la
	// détiennent pas, superadmin si.
	grant, _ := console.Registry().Lookup("POST", "/v1/admin/subscriptions/grants")
	for _, role := range []string{adminauthz.RoleSupport, adminauthz.RoleAnalyst} {
		if adminauthz.RoleSet(role).Has(grant) {
			t.Errorf("rôle %q peut écrire les abonnements (%q)", role, grant)
		}
	}
	if !adminauthz.RoleSet(adminauthz.RoleSuperadmin).Has(grant) {
		t.Errorf("superadmin ne peut pas écrire les abonnements (%q)", grant)
	}

	// Distribution des droits : lecture pour l'analyste, attribution pour le
	// superadmin seulement. Accorder `admin.access.grant` à un rôle de lecture
	// ouvrirait l'escalade par contournement du service.
	accessRead, _ := console.Registry().Lookup("GET", "/v1/admin/access/grants")
	accessGrant, _ := console.Registry().Lookup("POST", "/v1/admin/access/grants")
	if !adminauthz.RoleSet(adminauthz.RoleAnalyst).Has(accessRead) {
		t.Error("analyst doit pouvoir lire les attributions")
	}
	if adminauthz.RoleSet(adminauthz.RoleAnalyst).Has(accessGrant) {
		t.Error("analyst ne doit pas pouvoir attribuer un rôle")
	}
	if !adminauthz.RoleSet(adminauthz.RoleSuperadmin).Has(accessGrant) {
		t.Error("superadmin doit pouvoir attribuer un rôle")
	}
	for _, role := range []string{adminauthz.RoleSupport, adminauthz.RoleModeration, adminauthz.RoleContent, adminauthz.RoleOps, adminauthz.RoleLegal} {
		if adminauthz.RoleSet(role).Has(accessGrant) {
			t.Errorf("rôle %q ne doit pas détenir %q par défaut", role, accessGrant)
		}
	}
}

// ─── GET /v1/admin/me ─────────────────────────────────────────────────

// TestAdminMe_ReturnsRolesAndCapabilities — expose l'accès résolu, listes
// TOUJOURS non nulles (une liste null ferait tomber l'interface).
func TestAdminMe_ReturnsRolesAndCapabilities(t *testing.T) {
	lookup := &fakeLookup{access: adminauthz.Access{
		UserID:       adminReaderID,
		Roles:        []string{adminauthz.RoleSupport},
		Capabilities: adminauthz.RoleSet(adminauthz.RoleSupport),
	}}
	r, _, _ := testConsole(t, lookup)

	w := do(r, http.MethodGet, "/v1/admin/me", adminReaderID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("me = %d %s", w.Code, w.Body.String())
	}
	var body struct {
		UserID       string   `json:"userId"`
		Roles        []string `json:"roles"`
		Capabilities []string `json:"capabilities"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if body.UserID != adminReaderID {
		t.Errorf("userId = %q", body.UserID)
	}
	if len(body.Roles) != 1 || body.Roles[0] != adminauthz.RoleSupport {
		t.Errorf("roles = %v", body.Roles)
	}
	want := len(adminauthz.RoleCapabilities[adminauthz.RoleSupport])
	if len(body.Capabilities) != want {
		t.Errorf("capacités = %d, attendu %d", len(body.Capabilities), want)
	}
	if strings.Contains(w.Body.String(), "null") {
		t.Fatalf("contrat JSON rompu (null dans %s)", w.Body.String())
	}
}

// TestAdminMe_EmptyAccessIsNotNull — un compte sans rôle obtient des listes
// vides, jamais null : la console peut tout masquer sans crasher.
func TestAdminMe_EmptyAccessIsNotNull(t *testing.T) {
	r, _, _ := testConsole(t, &fakeLookup{access: adminauthz.Access{UserID: adminReaderID}})
	w := do(r, http.MethodGet, "/v1/admin/me", adminReaderID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("me = %d %s", w.Code, w.Body.String())
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	for _, key := range []string{"roles", "capabilities"} {
		if string(body[key]) != "[]" {
			t.Errorf("%s = %s, attendu []", key, body[key])
		}
	}
}

// TestAdminMe_WithoutLookupIsExplicit — sans registre branché, la route refuse
// explicitement (503) plutôt que de décrire un accès vide qui ferait croire à
// une absence de droits.
func TestAdminMe_WithoutLookupIsExplicit(t *testing.T) {
	r := chi.NewRouter()
	NewHandler(NewService(nil)).Register(r)
	w := do(r, http.MethodGet, "/v1/admin/me", adminReaderID, "")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("me sans registre = %d, attendu 503 (%s)", w.Code, w.Body.String())
	}
}

// TestAdminMe_RequiresAuthentication — pas de session, pas d'identité : 401,
// comme le reste de la console.
func TestAdminMe_RequiresAuthentication(t *testing.T) {
	r, _, _ := testConsole(t, nil)
	if w := do(r, http.MethodGet, "/v1/admin/me", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("me anonyme = %d, attendu 401 (%s)", w.Code, w.Body.String())
	}
}

// ─── Garde monté sur les vraies routes ────────────────────────────────

// TestAdminGuardDeniesInEnforceMode — de bout en bout, mode refus : support et
// analyste se font refuser l'octroi d'abonnement avec le code transporté,
// tandis que le superadmin passe. Les routes refusées n'atteignent jamais leur
// handler (donc jamais le service, ici sans base).
func TestAdminGuardDeniesInEnforceMode(t *testing.T) {
	denied := []struct {
		name string
		role string
	}{
		{"support ne peut pas écrire les abonnements", adminauthz.RoleSupport},
		{"analyst ne peut pas écrire les abonnements", adminauthz.RoleAnalyst},
	}
	for _, tc := range denied {
		t.Run(tc.name, func(t *testing.T) {
			r, _, _ := testConsole(t, &enforcingLookup{access: adminauthz.Access{
				UserID:       adminReaderID,
				Roles:        []string{tc.role},
				Capabilities: adminauthz.RoleSet(tc.role),
			}})
			w := do(r, http.MethodPost, "/v1/admin/subscriptions/grants", adminReaderID,
				`{"subjectType":"user","subjectId":"`+adminCreator+`","plan":"pro"}`)
			if w.Code != http.StatusForbidden {
				t.Fatalf("octroi en %s = %d, attendu 403 (%s)", tc.role, w.Code, w.Body.String())
			}
			if got := w.Header().Get("X-Qoe-Authz-Code"); got != "deny_missing_capability" {
				t.Errorf("X-Qoe-Authz-Code = %q", got)
			}
			if !strings.Contains(w.Body.String(), "admin.subscriptions.write") {
				t.Errorf("le corps ne nomme pas la capacité manquante : %s", w.Body.String())
			}
		})
	}

	// Analyste : refus sur toutes les écritures déclarées, sur la vraie route.
	t.Run("analyst refusé sur toute écriture", func(t *testing.T) {
		r, console, _ := testConsole(t, &enforcingLookup{access: adminauthz.Access{
			UserID:       adminReaderID,
			Roles:        []string{adminauthz.RoleAnalyst},
			Capabilities: adminauthz.RoleSet(adminauthz.RoleAnalyst),
		}})
		checked := 0
		for _, rt := range console.Registry().Routes() {
			if rt.Capability.IsReadOnly() {
				continue
			}
			checked++
			w := do(r, rt.Method, fillPath(rt.Pattern), adminReaderID, "{}")
			if w.Code != http.StatusForbidden {
				t.Fatalf("%s = %d, attendu 403 pour un analyste (%s)", rt.Key(), w.Code, w.Body.String())
			}
		}
		if checked == 0 {
			t.Fatal("aucune route d'écriture examinée")
		}
	})

	// Superadmin : passe le garde sur /v1/admin/me (route sans base).
	t.Run("superadmin passe", func(t *testing.T) {
		r, _, _ := testConsole(t, &enforcingLookup{access: adminauthz.Access{
			UserID:       adminReaderID,
			Roles:        []string{adminauthz.RoleSuperadmin},
			Capabilities: adminauthz.AllCapabilities(),
		}})
		if w := do(r, http.MethodGet, "/v1/admin/me", adminReaderID, ""); w.Code != http.StatusOK {
			t.Fatalf("me superadmin = %d, attendu 200 (%s)", w.Code, w.Body.String())
		}
	})
}
