package adminauthz

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// TestMigrationParity verrouille le miroir Go ↔ SQL de la migration
// 00053_admin_rbac.sql : vocabulaire des capacités, rôles et matrice
// rôle → capacité. Ajouter une capacité d'un seul côté fait échouer ce test —
// c'est la seule protection contre une base qui accorderait un droit que le Go
// ne connaît pas (ou l'inverse, un droit déclaré mais inattribuable).
//
// Le fichier est lu depuis le disque (pas de base de données) : le test tourne
// sans Docker, comme le reste du paquet.
const migrationPath = "../../sql/migrations/00053_admin_rbac.sql"

// quoted matches a single-quoted SQL string, escaped quotes (” ) inclus.
const quotedSQL = `'(?:[^']|'')*'`

var (
	reCapabilityRow = regexp.MustCompile(`\(\s*'([^']+)'\s*,\s*` + quotedSQL + `\s*,\s*'([^']+)'\s*,`)
	reRoleRow       = regexp.MustCompile(`\(\s*'([^']+)'\s*,\s*` + quotedSQL + `\s*,\s*` + quotedSQL + `\s*,\s*(?:true|false)\s*\)`)
	reMatrixRow     = regexp.MustCompile(`\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)`)
)

func readMigration(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("migration illisible (%s) : %v", migrationPath, err)
	}
	return string(raw)
}

// sqlBlock isole les lignes de valeurs d'un INSERT (jusqu'au ON CONFLICT qui
// le termine).
func sqlBlock(t *testing.T, sql, header string) string {
	t.Helper()
	i := strings.Index(sql, header)
	if i < 0 {
		t.Fatalf("bloc %q introuvable dans la migration", header)
	}
	rest := sql[i:]
	j := strings.Index(rest, "ON CONFLICT")
	if j < 0 {
		t.Fatalf("bloc %q sans ON CONFLICT (idempotence non prouvable)", header)
	}
	return rest[:j]
}

// sqlStatement isole une instruction complète (ON CONFLICT inclus).
func sqlStatement(t *testing.T, sql, header string) string {
	t.Helper()
	i := strings.Index(sql, header)
	if i < 0 {
		t.Fatalf("instruction %q introuvable dans la migration", header)
	}
	rest := sql[i:]
	j := strings.Index(rest, "-- +goose StatementEnd")
	if j < 0 {
		t.Fatalf("instruction %q sans fin de bloc goose", header)
	}
	return rest[:j]
}

// TestMigrationParity_Capabilities — le vocabulaire SQL est exactement le
// vocabulaire Go, avec le même domaine pour chaque capacité.
func TestMigrationParity_Capabilities(t *testing.T) {
	sql := sqlBlock(t, readMigration(t), `INSERT INTO "AdminCapability"`)

	type row struct{ domain string }
	got := map[Capability]row{}
	for _, m := range reCapabilityRow.FindAllStringSubmatch(sql, -1) {
		key, domain := Capability(m[1]), m[2]
		if _, dup := got[key]; dup {
			t.Fatalf("capacité %q semée deux fois", key)
		}
		got[key] = row{domain: domain}
	}

	if len(got) != len(Capabilities()) {
		t.Fatalf("SQL sème %d capacités, Go en déclare %d", len(got), len(Capabilities()))
	}
	for _, c := range Capabilities() {
		r, ok := got[c]
		if !ok {
			t.Errorf("capacité Go %q absente de la migration", c)
			continue
		}
		if r.domain != c.Domain() {
			t.Errorf("capacité %q : domaine SQL %q, domaine Go %q", c, r.domain, c.Domain())
		}
	}
	for c := range got {
		if !c.Valid() {
			t.Errorf("capacité SQL %q inconnue du vocabulaire Go", c)
		}
	}

	// Le CHECK du domaine doit lister exactement les domaines Go.
	for _, d := range Domains() {
		if !strings.Contains(sql, "'"+d+"'") {
			t.Errorf("domaine Go %q absent du bloc AdminCapability", d)
		}
	}
}

// TestMigrationParity_Roles — les rôles semés sont exactement les rôles Go.
func TestMigrationParity_Roles(t *testing.T) {
	sql := sqlBlock(t, readMigration(t), `INSERT INTO "AdminRole"`)
	got := map[string]bool{}
	for _, m := range reRoleRow.FindAllStringSubmatch(sql, -1) {
		got[m[1]] = true
	}
	if len(got) != len(Roles()) {
		t.Fatalf("SQL sème %d rôles, Go en déclare %d", len(got), len(Roles()))
	}
	for _, r := range Roles() {
		if !got[r] {
			t.Errorf("rôle Go %q absent de la migration", r)
		}
	}
	for r := range got {
		if !ValidRole(r) {
			t.Errorf("rôle SQL %q inconnu du Go", r)
		}
	}
}

// TestMigrationParity_Matrix — la matrice rôle → capacité de la migration est
// identique, ligne pour ligne, à RoleCapabilities. C'est le cœur de la parité :
// une capacité accordée en base mais refusée par le Go (ou l'inverse) est
// exactement le bug que ce test existe pour attraper.
func TestMigrationParity_Matrix(t *testing.T) {
	sql := sqlBlock(t, readMigration(t), `INSERT INTO "AdminRoleCapability"`)

	type pair struct{ role, capability string }
	got := map[pair]bool{}
	for _, m := range reMatrixRow.FindAllStringSubmatch(sql, -1) {
		role, cap := m[1], Capability(m[2])
		if !ValidRole(role) {
			t.Fatalf("matrice : rôle inconnu %q", role)
		}
		if !cap.Valid() {
			t.Fatalf("matrice : capacité inconnue %q", cap)
		}
		p := pair{role, string(cap)}
		if got[p] {
			t.Fatalf("matrice : ligne dupliquée %v", p)
		}
		got[p] = true
	}

	for _, role := range Roles() {
		want := map[Capability]bool{}
		for _, c := range RoleCapabilities[role] {
			want[c] = true
			if !got[pair{role, string(c)}] {
				t.Errorf("%s : capacité %q déclarée en Go mais absente du SQL", role, c)
			}
		}
		// Réciproque : rien en base qui ne soit pas en Go.
		var extra []string
		for p := range got {
			if p.role == role && !want[Capability(p.capability)] {
				extra = append(extra, p.capability)
			}
		}
		sort.Strings(extra)
		if len(extra) > 0 {
			t.Errorf("%s : capacités en SQL mais absentes du Go : %v", role, extra)
		}
	}

	totalGo := 0
	for _, caps := range RoleCapabilities {
		totalGo += len(caps)
	}
	if len(got) != totalGo {
		t.Fatalf("matrice SQL = %d lignes, matrice Go = %d", len(got), totalGo)
	}
}

// TestMigrationBackfill — le déploiement ne peut pas retirer un accès : tout
// `User."role" = 'superadmin'` reçoit le rôle superadmin, de façon idempotente.
func TestMigrationBackfill(t *testing.T) {
	sql := readMigration(t)
	block := sqlStatement(t, sql, `INSERT INTO "AdminUserRole"`)
	for _, want := range []string{`"userId"`, `"roleKey"`, `'superadmin'`, `"role" = 'superadmin'`} {
		if !strings.Contains(block, want) {
			t.Errorf("backfill : %q absent", want)
		}
	}
	if !strings.Contains(block, `ON CONFLICT ("userId", "roleKey") DO NOTHING`) {
		t.Error("backfill non idempotent : ON CONFLICT DO NOTHING attendu")
	}

	// Le Down doit retirer les quatre tables, dans l'ordre inverse des FK.
	down := sql[strings.Index(sql, "-- +goose Down"):]
	order := []string{`DROP TABLE IF EXISTS "AdminUserRole"`, `DROP TABLE IF EXISTS "AdminRoleCapability"`, `DROP TABLE IF EXISTS "AdminRole"`, `DROP TABLE IF EXISTS "AdminCapability"`}
	last := -1
	for _, stmt := range order {
		i := strings.Index(down, stmt)
		if i < 0 {
			t.Fatalf("Down : %q absent", stmt)
		}
		if i < last {
			t.Fatalf("Down : %q dans le mauvais ordre", stmt)
		}
		last = i
	}
}

// TestMigrationGooseHeader — la migration est bien formée pour goose : elle
// porte les deux sections et, comme elle enchaîne plusieurs instructions dans
// un même bloc, elle les encadre par StatementBegin/StatementEnd.
func TestMigrationGooseHeader(t *testing.T) {
	sql := readMigration(t)
	for _, want := range []string{"-- +goose Up", "-- +goose Down", "-- +goose StatementBegin", "-- +goose StatementEnd"} {
		if !strings.Contains(sql, want) {
			t.Errorf("en-tête goose incomplet : %q absent", want)
		}
	}
	if strings.Count(sql, "-- +goose StatementBegin") != strings.Count(sql, "-- +goose StatementEnd") {
		t.Error("blocs StatementBegin/End déséquilibrés")
	}
	up := strings.Index(sql, "-- +goose Up")
	down := strings.Index(sql, "-- +goose Down")
	if up < 0 || down < 0 || up > down {
		t.Error("sections Up/Down absentes ou inversées")
	}
}
