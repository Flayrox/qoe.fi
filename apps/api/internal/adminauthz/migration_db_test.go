package adminauthz

// ── 00053_admin_rbac.sql exécutée pour de vrai ─────────────────────────
//
// Ces tests appliquent la migration sur un PostgreSQL réel et vérifient ce que
// la base contient VRAIMENT : le backfill des promotions historiques, la
// matrice semée, les contraintes (CHECK d'échéance, CHECK de domaine, clés
// étrangères) et le retour arrière. Le test de parité (`migration_parity_test.go`)
// lit le fichier ; celui-ci prouve que la base l'applique.

import (
	"context"
	"os"
	"strings"
	"testing"
)

// TestMigration00053_AppliesRollsBackAndReapplies — la migration monte, se
// défait proprement, et remonte : un `goose down` qui laisserait des tables
// orphelines ou qui casserait la remontée est un déploiement raté.
func TestMigration00053_AppliesRollsBackAndReapplies(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)

	if got := db.version(t); got != 53 {
		t.Fatalf("version goose = %d, attendu 53", got)
	}
	for _, table := range []string{"AdminCapability", "AdminRole", "AdminRoleCapability", "AdminUserRole"} {
		if !db.tableExists(t, table) {
			t.Fatalf("table %s absente après application de 00053", table)
		}
	}

	// Retour arrière : les quatre tables disparaissent, le reste du schéma tient.
	db.downTo(t, 52)
	if got := db.version(t); got != 52 {
		t.Fatalf("version goose après down = %d, attendu 52", got)
	}
	for _, table := range []string{"AdminCapability", "AdminRole", "AdminRoleCapability", "AdminUserRole"} {
		if db.tableExists(t, table) {
			t.Fatalf("table %s encore présente après goose down", table)
		}
	}
	if !db.tableExists(t, "User") {
		t.Fatal("goose down a emporté la table User")
	}

	// Remontée : mêmes contenus, aucun résidu de la première application.
	db.upToLatest(t)
	if got := db.version(t); got != 53 {
		t.Fatalf("version goose après remontée = %d, attendu 53", got)
	}
	if n := db.count(t, "AdminCapability"); n != len(Capabilities()) {
		t.Fatalf("AdminCapability = %d capacités après remontée, attendu %d", n, len(Capabilities()))
	}
	if n := db.count(t, "AdminRole"); n != len(Roles()) {
		t.Fatalf("AdminRole = %d rôles après remontée, attendu %d", n, len(Roles()))
	}
}

// TestBackfill_GrantsSuperadminToLegacyPromotionsOnly — le point de sûreté du
// déploiement : personne ne perd l'accès, personne n'en gagne.
func TestBackfill_GrantsSuperadminToLegacyPromotionsOnly(t *testing.T) {
	db := newTestDatabase(t)

	// On s'arrête AVANT 00053, on peuple des comptes comme en production (des
	// superadmins historiques existent déjà), puis on applique 00053 : c'est le
	// seul ordre qui reproduise un vrai déploiement.
	db.upTo(t, 52)

	superadmin := db.createUser(t, uuid(1), "legacy-super@test.dev", "superadmin")
	admin2 := db.createUser(t, uuid(2), "legacy-super-2@test.dev", "superadmin")
	reader := db.createUser(t, uuid(3), "reader@test.dev", "user")
	creator := db.createUser(t, uuid(4), "creator@test.dev", "creator")

	if db.tableExists(t, "AdminUserRole") {
		t.Fatal("AdminUserRole existe avant l'application de 00053")
	}

	db.upToLatest(t)

	if n := db.count(t, "AdminUserRole"); n != 2 {
		t.Fatalf("backfill = %d lignes, attendu 2 (une par superadmin historique)", n)
	}

	// Les deux superadmins historiques reçoivent le rôle couvrant TOUT, sans
	// fin et sans auteur (backfill système).
	for _, id := range []string{superadmin, admin2} {
		var roleKey string
		var expiresAt *string
		var grantedBy *string
		err := db.pool.QueryRow(context.Background(),
			`SELECT "roleKey", "expiresAt"::text, "grantedBy"::text FROM "AdminUserRole" WHERE "userId" = $1`, id).
			Scan(&roleKey, &expiresAt, &grantedBy)
		if err != nil {
			t.Fatalf("backfill de %s: %v", id, err)
		}
		if roleKey != RoleSuperadmin {
			t.Errorf("%s : rôle backfillé = %q, attendu %q", id, roleKey, RoleSuperadmin)
		}
		if expiresAt != nil {
			t.Errorf("%s : attribution backfillée avec échéance (%v) — elle doit être sans fin", id, *expiresAt)
		}
		if grantedBy != nil {
			t.Errorf("%s : attribution backfillée avec un auteur (%v)", id, *grantedBy)
		}
	}

	// Les comptes non promus ne reçoivent RIEN.
	for _, id := range []string{reader, creator} {
		var n int
		if err := db.pool.QueryRow(context.Background(),
			`SELECT count(*) FROM "AdminUserRole" WHERE "userId" = $1`, id).Scan(&n); err != nil {
			t.Fatalf("comptage des rôles de %s: %v", id, err)
		}
		if n != 0 {
			t.Fatalf("le backfill a attribué %d rôle(s) à un compte non promu (%s)", n, id)
		}
	}

	// Et l'effet est réel : le legacy superadmin résout TOUTES les capacités,
	// le lecteur aucune.
	super := db.resolve(t, db.service(), superadmin)
	if len(super.CapabilityKeys()) != len(Capabilities()) {
		t.Fatalf("legacy superadmin = %d capacités, attendu %d", len(super.CapabilityKeys()), len(Capabilities()))
	}
	if !super.IsSuperadmin() {
		t.Fatal("legacy superadmin non reconnu après backfill")
	}
	if caps := db.resolve(t, db.service(), reader).Capabilities; !caps.Empty() {
		t.Fatalf("un compte non promu détient des capacités : %v", caps.Keys())
	}
}

// TestBackfill_IsIdempotent — rejouer la migration (redéploiement, reprise
// après échec) ne duplique rien : la PK et le ON CONFLICT DO NOTHING font foi.
func TestBackfill_IsIdempotent(t *testing.T) {
	db := newTestDatabase(t)
	db.upTo(t, 52)
	db.createUser(t, uuid(1), "legacy-super@test.dev", "superadmin")
	db.upToLatest(t)

	if n := db.count(t, "AdminUserRole"); n != 1 {
		t.Fatalf("après migration = %d lignes, attendu 1", n)
	}

	// La MÊME instruction, relue depuis la migration de référence, rejouée
	// deux fois : rien de plus.
	statement := backfillStatement(t)
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		if _, err := db.pool.Exec(ctx, statement); err != nil {
			t.Fatalf("rejeu %d du backfill: %v", i+1, err)
		}
	}
	if n := db.count(t, "AdminUserRole"); n != 1 {
		t.Fatalf("rejeu du backfill = %d lignes, attendu 1 (idempotence)", n)
	}

	// Une promotion faite APRÈS la migration reste dérivée à la volée par le Go
	// (User."role"), même sans ligne dans AdminUserRole.
	late := db.createUser(t, uuid(9), "promoted-later@test.dev", "superadmin")
	access := db.resolve(t, db.service(), late)
	if !access.IsSuperadmin() || len(access.CapabilityKeys()) != len(Capabilities()) {
		t.Fatalf("promotion postérieure non reconnue : %v", access.CapabilityKeys())
	}
}

// TestSeededMatrixMatchesGo_LiveDatabase — ce que PostgreSQL contient est
// exactement la matrice Go : mêmes capacités, mêmes domaines, mêmes rôles,
// mêmes lignes de rôle→capacité. Le test de parité vérifie le FICHIER ; celui-ci
// vérifie la BASE une fois semée.
func TestSeededMatrixMatchesGo_LiveDatabase(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	ctx := context.Background()

	// Capacités + domaines.
	rows, err := db.pool.Query(ctx, `SELECT "key", "domain" FROM "AdminCapability"`)
	if err != nil {
		t.Fatalf("lecture des capacités: %v", err)
	}
	gotCaps := map[Capability]string{}
	for rows.Next() {
		var key, domain string
		if err := rows.Scan(&key, &domain); err != nil {
			rows.Close()
			t.Fatalf("scan capacité: %v", err)
		}
		gotCaps[Capability(key)] = domain
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatalf("lecture des capacités: %v", err)
	}
	if len(gotCaps) != len(Capabilities()) {
		t.Fatalf("base = %d capacités, Go = %d", len(gotCaps), len(Capabilities()))
	}
	for _, c := range Capabilities() {
		domain, ok := gotCaps[c]
		if !ok {
			t.Errorf("capacité %q absente de la base", c)
			continue
		}
		if domain != c.Domain() {
			t.Errorf("capacité %q : domaine en base %q, domaine Go %q", c, domain, c.Domain())
		}
	}

	// Rôles : exactement ceux du Go, et tous systèmes.
	var unknownRoles []string
	roleRows, err := db.pool.Query(ctx, `SELECT "key", "isSystem" FROM "AdminRole"`)
	if err != nil {
		t.Fatalf("lecture des rôles: %v", err)
	}
	seenRoles := map[string]bool{}
	for roleRows.Next() {
		var key string
		var isSystem bool
		if err := roleRows.Scan(&key, &isSystem); err != nil {
			roleRows.Close()
			t.Fatalf("scan rôle: %v", err)
		}
		seenRoles[key] = true
		if !isSystem {
			t.Errorf("rôle semé %q non marqué système", key)
		}
		if !ValidRole(key) {
			unknownRoles = append(unknownRoles, key)
		}
	}
	roleRows.Close()
	if err := roleRows.Err(); err != nil {
		t.Fatalf("lecture des rôles: %v", err)
	}
	for _, r := range Roles() {
		if !seenRoles[r] {
			t.Errorf("rôle Go %q absent de la base", r)
		}
	}
	if len(unknownRoles) > 0 {
		t.Errorf("rôles en base inconnus du Go : %v", unknownRoles)
	}

	// Matrice rôle → capacité, dans les deux sens.
	matrixRows, err := db.pool.Query(ctx, `SELECT "roleKey", "capabilityKey" FROM "AdminRoleCapability"`)
	if err != nil {
		t.Fatalf("lecture de la matrice: %v", err)
	}
	got := map[string]map[Capability]bool{}
	for matrixRows.Next() {
		var role, cap string
		if err := matrixRows.Scan(&role, &cap); err != nil {
			matrixRows.Close()
			t.Fatalf("scan matrice: %v", err)
		}
		if got[role] == nil {
			got[role] = map[Capability]bool{}
		}
		got[role][Capability(cap)] = true
	}
	matrixRows.Close()
	if err := matrixRows.Err(); err != nil {
		t.Fatalf("lecture de la matrice: %v", err)
	}
	for _, role := range Roles() {
		want := map[Capability]bool{}
		for _, c := range RoleCapabilities[role] {
			want[c] = true
			if !got[role][c] {
				t.Errorf("%s : %q en Go mais pas en base", role, c)
			}
		}
		for c := range got[role] {
			if !want[c] {
				t.Errorf("%s : %q en base mais pas en Go", role, c)
			}
		}
	}
}

// TestMigration00053_ConstraintsAreReal — les garde-fous du schéma tiennent
// même si le Go se trompait : domaine hors vocabulaire refusé, échéance
// antérieure à l'attribution refusée, suppression d'un compte qui emporte ses
// rôles, suppression de l'auteur qui n'emporte que le lien.
func TestMigration00053_ConstraintsAreReal(t *testing.T) {
	db := newTestDatabase(t)
	db.upToLatest(t)
	ctx := context.Background()

	// Domaine hors vocabulaire fermé : refusé par le CHECK.
	_, err := db.pool.Exec(ctx,
		`INSERT INTO "AdminCapability" ("key", "label", "domain") VALUES ('admin.fake.read', 'Faux', 'bidon')`)
	if err == nil {
		t.Fatal("un domaine hors vocabulaire a été accepté")
	}
	if !strings.Contains(err.Error(), "AdminCapability_domain_check") {
		t.Errorf("refus inattendu (attendu : CHECK de domaine) : %v", err)
	}

	// Rôle inconnu : la clé étrangère refuse.
	user := db.createUser(t, uuid(1), "fk@test.dev", "user")
	_, err = db.pool.Exec(ctx,
		`INSERT INTO "AdminUserRole" ("userId", "roleKey") VALUES ($1, 'root')`, user)
	if err == nil {
		t.Fatal("un rôle inconnu a été accepté")
	}

	// Échéance antérieure à l'attribution : refusée par le CHECK.
	_, err = db.pool.Exec(ctx,
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, 'support', now(), now() - interval '1 day')`, user)
	if err == nil {
		t.Fatal("une échéance antérieure à l'attribution a été acceptée")
	}
	if !strings.Contains(err.Error(), "AdminUserRole_expiry_check") {
		t.Errorf("refus inattendu (attendu : CHECK d'échéance) : %v", err)
	}

	// FK : suppression du compte → ses rôles partent ; suppression de l'auteur
	// → l'attribution reste, sans auteur.
	granter := db.createUser(t, uuid(2), "granter@test.dev", "superadmin")
	target := db.createUser(t, uuid(3), "target@test.dev", "user")
	if _, err := db.pool.Exec(ctx,
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedBy") VALUES ($1, 'support', $2)`, target, granter); err != nil {
		t.Fatalf("attribution: %v", err)
	}
	if _, err := db.pool.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, granter); err != nil {
		t.Fatalf("suppression de l'auteur: %v", err)
	}
	var grantedBy *string
	if err := db.pool.QueryRow(ctx,
		`SELECT "grantedBy"::text FROM "AdminUserRole" WHERE "userId" = $1`, target).Scan(&grantedBy); err != nil {
		t.Fatalf("attribution perdue avec l'auteur: %v", err)
	}
	if grantedBy != nil {
		t.Errorf("auteur non effacé : %v", *grantedBy)
	}
	if _, err := db.pool.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, target); err != nil {
		t.Fatalf("suppression du compte: %v", err)
	}
	if n := db.count(t, "AdminUserRole"); n != 0 {
		t.Fatalf("attributions restantes après suppression du compte : %d", n)
	}

	// Suppression d'un rôle → ses lignes de matrice partent (CASCADE).
	if _, err := db.pool.Exec(ctx, `DELETE FROM "AdminRole" WHERE "key" = 'analyst'`); err != nil {
		t.Fatalf("suppression du rôle analyst: %v", err)
	}
	var orphan int
	if err := db.pool.QueryRow(ctx,
		`SELECT count(*) FROM "AdminRoleCapability" WHERE "roleKey" = 'analyst'`).Scan(&orphan); err != nil {
		t.Fatalf("comptage de la matrice: %v", err)
	}
	if orphan != 0 {
		t.Fatalf("la matrice garde %d lignes pour un rôle supprimé", orphan)
	}
}

// backfillStatement relit l'instruction de backfill depuis la migration de
// référence : le test suit la migration au lieu de la recopier.
func backfillStatement(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("migration illisible (%s): %v", migrationPath, err)
	}
	sql := string(raw)
	start := strings.Index(sql, `INSERT INTO "AdminUserRole"`)
	if start < 0 {
		t.Fatal("instruction de backfill introuvable dans la migration")
	}
	rest := sql[start:]
	end := strings.Index(rest, ";")
	if end < 0 {
		t.Fatal("instruction de backfill non terminée par un point-virgule")
	}
	return rest[:end]
}
