package publicurl

import "testing"

// F769 — `QOE_CONFIRM_BASE_URL` est concaténée telle quelle aux chemins de
// confirmation et de désinscription. Une valeur sans schéma (copiée d'un
// `curl`, hôte nu) produit des liens `api.qoe.fi/v1/confirm?...` : dans un
// client mail, ce n'est pas une URL absolue, le lien ne s'ouvre pas — et
// l'inscription comme la désinscription deviennent impossibles.
func TestAuditL34_MalformedBaseFallsBackToDefault(t *testing.T) {
	for _, bad := range []string{"api.qoe.fi", "//api.qoe.fi", "javascript:alert(1)", "ftp://api.qoe.fi", "/v1"} {
		t.Run(bad, func(t *testing.T) {
			t.Setenv("QOE_CONFIRM_BASE_URL", bad)
			if got := Base(); got != DefaultBase {
				t.Errorf("Base() = %q pour %q, attendu le défaut %q", got, bad, DefaultBase)
			}
		})
	}

	// Une origine absolue valide reste honorée, sans slash final.
	t.Setenv("QOE_CONFIRM_BASE_URL", "http://api.qoe.test:15407/")
	if got := Base(); got != "http://api.qoe.test:15407" {
		t.Errorf("Base() = %q, attendu http://api.qoe.test:15407", got)
	}
}

// F771 — les origines des liens d'e-mail (lecteur et studio) suivent la même
// règle que l'API : défaut sans variable, surcharge par variable, valeur
// inutilisable ignorée. Sans cela un déploiement self-hosté envoie ses
// notifications vers la production.
func TestAuditL34_ReaderAndStudioOrigins(t *testing.T) {
	t.Setenv("QOE_PUBLIC_URL", "https://qoe.test/")
	t.Setenv("QOE_STUDIO_URL", "https://studio.qoe.test/")
	if got := Reader(); got != "https://qoe.test" {
		t.Errorf("Reader() = %q, attendu https://qoe.test", got)
	}
	if got := Studio(); got != "https://studio.qoe.test" {
		t.Errorf("Studio() = %q, attendu https://studio.qoe.test", got)
	}

	t.Setenv("QOE_PUBLIC_URL", "qoe.test")
	t.Setenv("QOE_STUDIO_URL", "")
	if got := Reader(); got != DefaultReader {
		t.Errorf("Reader() = %q pour une valeur sans schéma, attendu %q", got, DefaultReader)
	}
	if got := Studio(); got != DefaultStudio {
		t.Errorf("Studio() = %q sans variable, attendu %q", got, DefaultStudio)
	}
}
