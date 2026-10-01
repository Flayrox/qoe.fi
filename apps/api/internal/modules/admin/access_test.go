package admin

// =====================================================================
// 🧪 Accès staff — cycle de vie, garde-fous et audit (Phase 2)
// =====================================================================
// Ce que ces tests verrouillent :
//   - nommer quelqu'un puis lui poser une échéance laisse une trace relisible ;
//   - l'escalade est refusée (on ne distribue que ce qu'on détient) ;
//   - on ne se coupe pas la main (dernier rôle) et on ne coupe pas la
//     plateforme (dernier superadmin) ;
//   - un rôle échu n'accorde plus rien, mais reste LISIBLE ;
//   - la surface HTTP exige `admin.access.read` / `admin.access.grant`.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
)

// accessRouter monte le VRAI service (base de test) derrière la console
// partagée : la surface est testée telle que cmd/server la câble.
func accessRouter(t *testing.T, lookup adminauthz.Lookup) http.Handler {
	t.Helper()
	r := chi.NewRouter()
	console := adminauthz.NewConsole(r, lookup, nil)
	h := NewHandler(newTestService())
	h.SetConsole(console)
	h.Register(r)
	return r
}

// seedGrant insère une attribution directement en base (état de départ d'un
// test) — l'écriture est ensuite toujours exercée via le service.
func seedGrant(t *testing.T, ctx context.Context, userID, roleKey string, expiresAt string) {
	t.Helper()
	requirePool(t)
	if expiresAt == "" {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt")
			 VALUES ($1::uuid, $2, CURRENT_TIMESTAMP)`, userID, roleKey); err != nil {
			t.Fatalf("seed grant %s: %v", roleKey, err)
		}
		return
	}
	// La contrainte "expiresAt" > "grantedAt" est respectée par construction :
	// l'attribution a été accordée dix jours avant son échéance.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1::uuid, $2, $3::timestamp - interval '10 days', $3::timestamp)`,
		userID, roleKey, expiresAt); err != nil {
		t.Fatalf("seed grant %s: %v", roleKey, err)
	}
}

// seedUser insère un compte minimal (sans promotion) et rend son identifiant.
func seedUser(t *testing.T, ctx context.Context, id, email, role string) {
	t.Helper()
	requirePool(t)
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, $2, $3, $4, $5, now(), now())`,
		id, email, email, email, role); err != nil {
		t.Fatalf("seed user %s: %v", email, err)
	}
}

func countAudit(t *testing.T, ctx context.Context, action string) int64 {
	t.Helper()
	var n int64
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "AdminAuditLog" WHERE action = $1`, action).Scan(&n); err != nil {
		t.Fatalf("count audit %s: %v", action, err)
	}
	return n
}

// TestAccessGrant_Lifecycle — attribuer → lire → expliquer → révoquer, avec la
// trace d'audit à chaque mouvement.
func TestAccessGrant_Lifecycle(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	if n := countAudit(t, ctx, "access.grant"); n != 0 {
		t.Fatalf("audit de départ non vide : %d", n)
	}

	grant, err := svc.GrantAccess(ctx, adminAdminID, GrantAccessInput{
		UserID:    adminReaderID,
		RoleKey:   adminauthz.RoleAnalyst,
		ExpiresAt: "2030-06-30",
		Reason:    "audit de lecture seule sur le mois de juin",
	})
	if err != nil {
		t.Fatalf("grant: %v", err)
	}
	if grant.RoleKey != adminauthz.RoleAnalyst || grant.State != "active" {
		t.Fatalf("grant = %+v", grant)
	}
	if grant.ExpiresAt == nil || grant.RoleLabel == "" {
		t.Fatalf("grant incomplet : %+v", grant)
	}
	if grant.GrantedBy == nil || *grant.GrantedBy != adminAdminID {
		t.Errorf("grantedBy = %v, attendu %s", grant.GrantedBy, adminAdminID)
	}

	list, err := svc.ListAccessGrants(ctx, "reader-adm", 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 || list[0].RoleKey != adminauthz.RoleAnalyst {
		t.Fatalf("liste = %+v", list)
	}
	if list[0].Email != "reader-adm@test.dev" {
		t.Errorf("email = %q", list[0].Email)
	}

	person, err := svc.AccessIdentity(ctx, adminReaderID)
	if err != nil {
		t.Fatalf("identité: %v", err)
	}
	if person.LegacySuperadmin {
		t.Error("legacySuperadmin vrai pour un lecteur")
	}
	if len(person.Roles) != 1 || person.Roles[0].State != "active" {
		t.Fatalf("rôles = %+v", person.Roles)
	}
	// L'analyste détient la lecture d'audit par le rôle `analyst` : la
	// provenance est nommée, pas seulement la liste des capacités.
	if !contains(person.Capabilities, string(adminauthz.AuditRead)) {
		t.Errorf("capacités = %v", person.Capabilities)
	}
	if src := person.CapabilitySources[string(adminauthz.AuditRead)]; len(src) != 1 || src[0] != adminauthz.RoleAnalyst {
		t.Errorf("provenance d'audit.read = %v", src)
	}

	revoked, err := svc.RevokeAccess(ctx, adminAdminID, adminReaderID, adminauthz.RoleAnalyst, "fin de mission")
	if err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if revoked.RoleKey != adminauthz.RoleAnalyst || revoked.State != "active" {
		t.Fatalf("révocation rendue = %+v", revoked)
	}
	list, err = svc.ListAccessGrants(ctx, "", 10)
	if err != nil {
		t.Fatalf("list après révocation: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("attributions restantes = %+v", list)
	}

	if n := countAudit(t, ctx, "access.grant"); n != 1 {
		t.Errorf("lignes d'audit access.grant = %d, attendu 1", n)
	}
	if n := countAudit(t, ctx, "access.revoke"); n != 1 {
		t.Errorf("lignes d'audit access.revoke = %d, attendu 1", n)
	}
}

// TestAccessGrant_RequiresMotive — un mouvement sans motif est refusé : c'est
// la seule chose qui rend le journal relisible.
func TestAccessGrant_RequiresMotive(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	if _, err := svc.GrantAccess(ctx, adminAdminID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleAnalyst, Reason: "  ",
	}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("grant sans motif : err = %v, attendu errInvalidAccess", err)
	}
	if _, err := svc.RevokeAccess(ctx, adminAdminID, adminReaderID, adminauthz.RoleAnalyst, "ok"); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("révocation au motif trivial : err = %v, attendu errInvalidAccess", err)
	}
	if _, err := svc.GrantAccess(ctx, adminAdminID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: "root", Reason: "un rôle inventé",
	}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("rôle hors vocabulaire : err = %v, attendu errInvalidAccess", err)
	}
	if _, err := svc.GrantAccess(ctx, adminAdminID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleAnalyst, Reason: "échéance passée", ExpiresAt: "2020-01-01",
	}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("échéance passée : err = %v, attendu errInvalidAccess", err)
	}
}

// TestAccessGrant_NoEscalation — on ne distribue que des capacités qu'on
// détient : un compte qui n'est pas superadmin ne peut pas nommer un
// superadmin, ni un rôle qui le dépasse.
func TestAccessGrant_NoEscalation(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Un compte de support (délégué) : ses capacités ne couvrent ni moderation
	// ni superadmin.
	supportID := "00000000-0000-0000-0000-0000000000b1"
	seedUser(t, ctx, supportID, "support-adm@test.dev", "user")
	seedGrant(t, ctx, supportID, adminauthz.RoleSupport, "")

	if _, err := svc.GrantAccess(ctx, supportID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleSuperadmin, Reason: "promotion du support",
	}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("escalade superadmin : err = %v, attendu errInvalidAccess", err)
	}
	if _, err := svc.GrantAccess(ctx, supportID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleModeration, Reason: "un peu plus de droits",
	}); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("escalade moderation : err = %v, attendu errInvalidAccess", err)
	}
	// Ce qu'il détient, il peut le distribuer.
	if _, err := svc.GrantAccess(ctx, supportID, GrantAccessInput{
		UserID: adminReaderID, RoleKey: adminauthz.RoleSupport, Reason: "renfort de support",
	}); err != nil {
		t.Fatalf("attribution legitime refusée : %v", err)
	}

	// Et il ne peut pas déclasser au-dessus de lui (le superadmin porte un rôle
	// de matrice : la cible existe, c'est bien l'escalade qui refuse).
	seedGrant(t, ctx, adminAdminID, adminauthz.RoleSuperadmin, "")
	if _, err := svc.RevokeAccess(ctx, supportID, adminAdminID, adminauthz.RoleSuperadmin, "rétrogradation"); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("déclassement du superadmin : err = %v, attendu errInvalidAccess", err)
	}
}

// TestAccessRevoke_LastRoleAndLastSuperadmin — les deux verrous de sûreté, et
// la seule exception admise (promotion historique, qui garde tout).
func TestAccessRevoke_LastRoleAndLastSuperadmin(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	lonelyID := "00000000-0000-0000-0000-0000000000b2"
	seedUser(t, ctx, lonelyID, "dernier-adm@test.dev", "user")
	seedGrant(t, ctx, lonelyID, adminauthz.RoleAnalyst, "")

	// Retirer son propre dernier rôle : refusé.
	if _, err := svc.RevokeAccess(ctx, lonelyID, lonelyID, adminauthz.RoleAnalyst, "je m'en vais"); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("dernier rôle : err = %v, attendu errInvalidAccess", err)
	}
	// Mais quelqu'un d'autre peut le faire, à condition de détenir le rôle.
	if _, err := svc.RevokeAccess(ctx, adminAdminID, lonelyID, adminauthz.RoleAnalyst, "fin de mission"); err != nil {
		t.Fatalf("révocation par un superadmin : %v", err)
	}

	// Dernier superadmin NON historique : révoquer est interdit.
	lastID := "00000000-0000-0000-0000-0000000000b3"
	seedUser(t, ctx, lastID, "superadmin-adm@test.dev", "user")
	seedGrant(t, ctx, lastID, adminauthz.RoleSuperadmin, "")
	if _, err := svc.RevokeAccess(ctx, adminAdminID, lastID, adminauthz.RoleSuperadmin, "plus de superadmin"); !errors.Is(err, errInvalidAccess) {
		t.Fatalf("dernier superadmin : err = %v, attendu errInvalidAccess", err)
	}

	// Le superadmin HISTORIQUE (`User."role"`), lui, garde tout : révoquer son
	// rôle de matrice ne le verrouille pas, donc c'est permis.
	seedGrant(t, ctx, adminAdminID, adminauthz.RoleSuperadmin, "")
	if _, err := svc.RevokeAccess(ctx, adminAdminID, adminAdminID, adminauthz.RoleSuperadmin, "rang rendu explicite"); err != nil {
		t.Fatalf("révocation du rôle de la promotion historique : %v", err)
	}
}

// TestAccessGrants_ExpiredRoleIsVisibleButInert — une attribution échue reste
// LISIBLE (l'échéance est une information) mais n'accorde plus rien.
func TestAccessGrants_ExpiredRoleIsVisibleButInert(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	seedGrant(t, ctx, adminReaderID, adminauthz.RoleAnalyst,
		time.Now().Add(-24*time.Hour).UTC().Format("2006-01-02 15:04:05"))

	person, err := svc.AccessIdentity(ctx, adminReaderID)
	if err != nil {
		t.Fatalf("identité: %v", err)
	}
	if len(person.Roles) != 1 || person.Roles[0].State != "expired" {
		t.Fatalf("rôles = %+v", person.Roles)
	}
	if len(person.Capabilities) != 0 {
		t.Fatalf("un rôle échu accorde encore : %v", person.Capabilities)
	}
}

// TestAccessRoles_MatrixComesFromDatabase — la matrice affichée est celle de la
// base (capacités ET détenteurs actifs), pas une liste recopiée dans l'UI.
func TestAccessRoles_MatrixComesFromDatabase(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	seedGrant(t, ctx, adminReaderID, adminauthz.RoleAnalyst, "")

	roles, err := svc.AccessRoles(ctx)
	if err != nil {
		t.Fatalf("matrice: %v", err)
	}
	if len(roles) != len(adminauthz.Roles()) {
		t.Fatalf("rôles en base = %d, vocabulaire = %d", len(roles), len(adminauthz.Roles()))
	}
	byKey := map[string]AccessRole{}
	for _, role := range roles {
		byKey[role.Key] = role
	}
	analyst, ok := byKey[adminauthz.RoleAnalyst]
	if !ok {
		t.Fatal("rôle analyst absent de la matrice")
	}
	if analyst.Holders != 1 {
		t.Errorf("détenteurs analyst = %d, attendu 1", analyst.Holders)
	}
	if !contains(analyst.Capabilities, string(adminauthz.AccessRead)) {
		t.Errorf("la matrice doit porter admin.access.read : %v", analyst.Capabilities)
	}
	if contains(analyst.Capabilities, string(adminauthz.AccessGrant)) {
		t.Error("analyst ne détient pas admin.access.grant")
	}

	caps, err := svc.AccessCapabilities(ctx)
	if err != nil {
		t.Fatalf("vocabulaire: %v", err)
	}
	if len(caps) != len(adminauthz.Capabilities()) {
		t.Fatalf("capacités en base = %d, vocabulaire Go = %d", len(caps), len(adminauthz.Capabilities()))
	}
}

// ─── Surface HTTP ───────────────────────────────────────────────────────

// TestAccessRoutes_ReadThenGrant — superadmin : lecture 200 ; analyst (lecture
// seule) : refus sur le mouvement, avec le code de refus transporté.
func TestAccessRoutes_ReadThenGrant(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)

	superadmin := &enforcingLookup{access: adminauthz.Access{
		UserID: adminAdminID, Roles: []string{adminauthz.RoleSuperadmin},
		Capabilities: adminauthz.AllCapabilities(),
	}}
	r := accessRouter(t, superadmin)

	w := do(r, http.MethodGet, "/v1/admin/access/grants", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("lecture des attributions = %d %s", w.Code, w.Body.String())
	}
	var list struct {
		Items []AccessGrant `json:"items"`
		Total int           `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if list.Items == nil {
		t.Fatal("contrat rompu : items null")
	}
	if w := do(r, http.MethodGet, "/v1/admin/access/roles", adminAdminID, ""); w.Code != http.StatusOK {
		t.Fatalf("matrice = %d %s", w.Code, w.Body.String())
	}
	if w := do(r, http.MethodGet, "/v1/admin/access/people/"+adminReaderID, adminAdminID, ""); w.Code != http.StatusOK {
		t.Fatalf("fiche d'accès = %d %s", w.Code, w.Body.String())
	}

	// Mouvement refusé à l'analyste (il ne détient que la lecture).
	analyst := &enforcingLookup{access: adminauthz.Access{
		UserID: adminReaderID, Roles: []string{adminauthz.RoleAnalyst},
		Capabilities: adminauthz.RoleSet(adminauthz.RoleAnalyst),
	}}
	rAnalyst := accessRouter(t, analyst)
	w = do(rAnalyst, http.MethodPost, "/v1/admin/access/grants", adminReaderID,
		`{"userId":"`+adminCreator+`","roleKey":"analyst","reason":"lecture seule"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("attribution par un analyste = %d, attendu 403 (%s)", w.Code, w.Body.String())
	}
	if got := w.Header().Get("X-Qoe-Authz-Code"); got != "deny_missing_capability" {
		t.Errorf("X-Qoe-Authz-Code = %q", got)
	}
	if w := do(rAnalyst, http.MethodGet, "/v1/admin/access/grants", adminReaderID, ""); w.Code != http.StatusOK {
		t.Fatalf("lecture par un analyste = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
}

// TestAccessRoutes_InvalidInputIsClientError — un motif absent ou une échéance
// illisible répondent 400, pas 500 : la saisie est fautive, le serveur va bien.
func TestAccessRoutes_InvalidInputIsClientError(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	superadmin := &enforcingLookup{access: adminauthz.Access{
		UserID: adminAdminID, Roles: []string{adminauthz.RoleSuperadmin},
		Capabilities: adminauthz.AllCapabilities(),
	}}
	r := accessRouter(t, superadmin)

	cases := []struct {
		name string
		path string
		body string
	}{
		{"motif absent", "/v1/admin/access/grants", `{"userId":"` + adminReaderID + `","roleKey":"analyst"}`},
		{"rôle inconnu", "/v1/admin/access/grants", `{"userId":"` + adminReaderID + `","roleKey":"root","reason":"test de role"}`},
		{"échéance illisible", "/v1/admin/access/grants", `{"userId":"` + adminReaderID + `","roleKey":"analyst","reason":"test echeance","expiresAt":"demain"}`},
		{"personne inconnue", "/v1/admin/access/grants", `{"userId":"00000000-0000-0000-0000-00000000dead","roleKey":"analyst","reason":"test personne"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := do(r, http.MethodPost, tc.path, adminAdminID, tc.body)
			if w.Code != http.StatusBadRequest && w.Code != http.StatusNotFound {
				t.Fatalf("%s = %d %s, attendu 400/404", tc.name, w.Code, w.Body.String())
			}
		})
	}
}

// TestAccessPeople_SearchGuardsEnumeration — la recherche de personnes exige un
// motif : le vide ne liste pas la base des comptes, et le motif ne filtre que
// ce qu'il nomme.
func TestAccessPeople_SearchGuardsEnumeration(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	if items, err := svc.SearchAccessPeople(ctx, "", 20); err != nil || len(items) != 0 {
		t.Fatalf("recherche vide = %v (err=%v), attendu 0 résultat", items, err)
	}
	if items, err := svc.SearchAccessPeople(ctx, "a", 20); err != nil || len(items) != 0 {
		t.Fatalf("motif d'un caractère = %v (err=%v), attendu 0 résultat", items, err)
	}

	items, err := svc.SearchAccessPeople(ctx, "reader-adm", 20)
	if err != nil {
		t.Fatalf("recherche: %v", err)
	}
	if len(items) != 1 || items[0].UserID != adminReaderID {
		t.Fatalf("résultats = %+v", items)
	}
	if items[0].Roles == nil {
		t.Fatal("contrat rompu : roles null")
	}
	if items[0].LegacySuperadmin {
		t.Error("un lecteur n'est pas superadmin historique")
	}

	// Le superadmin historique est signalé comme tel : la console peut alors
	// expliquer qu'il détient déjà tout, sans requête supplémentaire.
	items, err = svc.SearchAccessPeople(ctx, "admin-adm", 20)
	if err != nil {
		t.Fatalf("recherche superadmin: %v", err)
	}
	if len(items) != 1 || !items[0].LegacySuperadmin {
		t.Fatalf("superadmin historique non signalé : %+v", items)
	}
}

// contains dit si la liste contient la valeur (petite aide de test).
func contains(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}
