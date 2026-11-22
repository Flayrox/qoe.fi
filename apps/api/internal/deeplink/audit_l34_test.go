package deeplink

import "testing"

// F771 — les origines des liens sortants étaient deux constantes de production
// (`https://qoe.fi`, `https://studio.qoe.fi`) : sur un déploiement self-hosté
// ou en local (`qoe.test`, `studio.qoe.test`), chaque e-mail de notification
// renvoie l'utilisateur vers la production — lien faux et fuite d'audience.
// AGENTS.md (portabilité) impose une origine pilotée par variable.
func TestAuditL34_AbsoluteURLFollowsConfiguredOrigins(t *testing.T) {
	t.Setenv("QOE_PUBLIC_URL", "https://qoe.test")
	t.Setenv("QOE_STUDIO_URL", "https://studio.qoe.test")

	if got, want := AbsoluteURL("/article/mon-article"), "https://qoe.test/article/mon-article"; got != want {
		t.Errorf("lien lecteur = %q, attendu %q", got, want)
	}
	if got, want := AbsoluteURL("/media"), "https://studio.qoe.test/media"; got != want {
		t.Errorf("lien studio = %q, attendu %q", got, want)
	}

	// Défauts de production inchangés quand rien n'est configuré.
	t.Setenv("QOE_PUBLIC_URL", "")
	t.Setenv("QOE_STUDIO_URL", "")
	if got, want := AbsoluteURL("/media"), "https://studio.qoe.fi/media"; got != want {
		t.Errorf("défaut studio = %q, attendu %q", got, want)
	}
	if got, want := AbsoluteURL("/article/x"), "https://qoe.fi/article/x"; got != want {
		t.Errorf("défaut lecteur = %q, attendu %q", got, want)
	}
}
