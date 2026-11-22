package admin

// Contrats de sérialisation et d'intégrité du module admin (lot L29e) :
// chaque test fixe un accord entre ce que la console ÉCRIT et ce qu'un autre
// composant RELIT (settings/users, surfaces publiques, vérificateur d'export).

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestEncodeReservedIdentifiers_MatchesReaders — settings/users découpent la
// denylist sur virgule, retour à la ligne et espace. Si l'écriture joint avec
// les DEUX caractères « \ » et « n », la liste entière devient un seul jeton :
// plus aucun nom réservé n'est reconnu après la première sauvegarde admin.
func TestEncodeReservedIdentifiers_MatchesReaders(t *testing.T) {
	raw := encodeReservedIdentifiers([]string{"admin", "api", "login"})

	var got []string
	for _, item := range strings.FieldsFunc(strings.ToLower(raw), func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == ' '
	}) {
		got = append(got, item)
	}
	want := []string{"admin", "api", "login"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("denylist relue = %q, attendu %q (brut %q)", got, want, raw)
	}
}

// TestRenderCampaignVars_AnyWhitespace — validateCampaignContent accepte toute
// espace (\s*) autour d'une variable autorisée. Le rendu doit donc substituer
// les mêmes formes, sinon le placeholder brut part chez des milliers
// d'abonnés.
func TestRenderCampaignVars_AnyWhitespace(t *testing.T) {
	for _, tpl := range []string{
		"{{publisher_name}}",
		"{{ publisher_name }}",
		"{{  publisher_name  }}",
		"{{\tpublisher_name\t}}",
	} {
		if err := validateCampaignContent(CampaignStaffDirect, "Sujet", tpl, "", ""); err != nil {
			t.Fatalf("validateCampaignContent(%q) = %v, attendu accepté", tpl, err)
		}
		if got, want := RenderCampaignVars(tpl, "Média <x>", ""), "Média &lt;x&gt;"; got != want {
			t.Errorf("RenderCampaignVars(%q) = %q, attendu %q", tpl, got, want)
		}
	}

	for _, tpl := range []string{"{{unsubscribe_url}}", "{{   unsubscribe_url   }}"} {
		if got, want := RenderCampaignVars(tpl, "", "/u?a=1&b=2"), "/u?a=1&amp;b=2"; got != want {
			t.Errorf("RenderCampaignVars(%q) = %q, attendu %q", tpl, got, want)
		}
	}
}

// TestSignedExport_DetectsEnvelopeTampering — le sceau doit couvrir les
// métadonnées que le vérificateur REND (portée, date, demandeur). Sinon un
// export valide peut être rejoué sous une autre portée ou une autre date sans
// que la vérification ne bronche.
func TestSignedExport_DetectsEnvelopeTampering(t *testing.T) {
	svc := &Service{}
	_, docBytes, err := svc.ExportSignedAudit(context.Background(), uuid.NewString(), AuditExportInput{})
	require.NoError(t, err)

	cases := map[string]func(env map[string]any){
		"portée":      func(env map[string]any) { env["scope"] = "subscribers" },
		"date":        func(env map[string]any) { env["generatedAt"] = "1999-01-01T00:00:00Z" },
		"demandeur":   func(env map[string]any) { env["requestedBy"] = uuid.NewString() },
		"identifiant": func(env map[string]any) { env["id"] = uuid.NewString() },
	}

	for name, mutate := range cases {
		var raw map[string]any
		require.NoError(t, json.Unmarshal(docBytes, &raw))
		env, ok := raw["envelope"].(map[string]any)
		require.True(t, ok, "enveloppe absente")
		mutate(env)
		tampered, err := json.Marshal(raw)
		require.NoError(t, err)

		verdict, err := svc.VerifySignedExport(tampered)
		require.NoError(t, err)
		if verdict.IsValid {
			t.Errorf("enveloppe altérée (%s) encore déclarée valide", name)
		}
	}
}

// TestParseExportBound_RejectsGarbage — une borne illisible ne doit jamais
// être ignorée : l'export serait signé comme « filtré » alors qu'il couvre
// tout l'historique.
func TestParseExportBound_RejectsGarbage(t *testing.T) {
	if _, _, err := parseExportBound("pas-une-date"); err == nil {
		t.Fatal("borne illisible acceptée silencieusement")
	}
	if _, ok, err := parseExportBound(""); ok || err != nil {
		t.Fatalf("borne vide = (%v, %v), attendu (false, nil)", ok, err)
	}
	if _, ok, err := parseExportBound("2026-01-02T03:04:05Z"); !ok || err != nil {
		t.Fatalf("borne RFC3339 = (%v, %v), attendu (true, nil)", ok, err)
	}
}

// TestValidAnnouncementLink — le lien est rendu en `href` public : seuls un
// chemin interne ou une URL http(s) sont sûrs.
func TestValidAnnouncementLink(t *testing.T) {
	allowed := []string{"/status", "/", "https://qoe.fi/status", "http://qoe.fi"}
	for _, link := range allowed {
		if !validAnnouncementLink(link) {
			t.Errorf("lien refusé à tort : %q", link)
		}
	}
	rejected := []string{"javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<script>", "//evil.example", "ftp://qoe.fi", "qoe.fi/status"}
	for _, link := range rejected {
		if validAnnouncementLink(link) {
			t.Errorf("lien dangereux accepté : %q", link)
		}
	}
}

// TestValidAllowlistEmail — une invitation qui ne peut correspondre à aucune
// adresse réelle ne doit pas entrer dans l'allowlist.
func TestValidAllowlistEmail(t *testing.T) {
	valid := []string{"user@example.com", "prenom.nom+tag@sous.domaine.fr"}
	for _, email := range valid {
		if !validAllowlistEmail(email) {
			t.Errorf("adresse refusée à tort : %q", email)
		}
	}
	invalid := []string{"", "@", "a@", "@b.com", "pas-un-email", "a@b", "Nom <a@b.com>", "a b@c.com", "a@.com", "a@com."}
	for _, email := range invalid {
		if validAllowlistEmail(email) {
			t.Errorf("adresse invalide acceptée : %q", email)
		}
	}
}

// TestExpectedMigrationVersionMatchesLatestMigration — la version attendue est
// une connaissance de compilation : sans ce garde, elle dérive en silence et
// le SLO ne détecte plus les migrations manquantes.
func TestExpectedMigrationVersionMatchesLatestMigration(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join("..", "..", "..", "sql", "migrations"))
	require.NoError(t, err)

	var latest int64
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		prefix, _, ok := strings.Cut(entry.Name(), "_")
		if !ok {
			continue
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			continue
		}
		if version > latest {
			latest = version
		}
	}
	require.NotZero(t, latest, "aucune migration lisible")
	if ExpectedMigrationVersion != latest {
		t.Fatalf("ExpectedMigrationVersion = %d, dernière migration = %d", ExpectedMigrationVersion, latest)
	}
}
