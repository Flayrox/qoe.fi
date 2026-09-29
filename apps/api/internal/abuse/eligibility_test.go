package abuse

// Éligibilité (fiche 06 §9) : ces tests verrouillent la SÉMANTIQUE des
// fragments SQL (qui est exclu d'où) sans base — la forme exacte du SQL
// peut évoluer, le sens ne doit pas.

import (
	"strings"
	"testing"
)

func TestDiscoveryExclusion_CoversLimitationAndHardBlock(t *testing.T) {
	frag := DiscoveryExclusionArticle("u", "a")
	for _, want := range []string{"'limit_distribution'", "'suspend'", "'user'", "'publication'", "decidedBy", "expiresAt"} {
		if !strings.Contains(frag, want) {
			t.Errorf("fragment découverte articles : %q manquant", want)
		}
	}
	// La découverte ne punit pas sur un verdict auto : seul l'humain tranche.
	if !strings.Contains(frag, "rd.\"decidedBy\" = 'human'") {
		t.Error("fragment découverte : seuls les verdicts humains excluent")
	}
	// Sujets liés aux bons alias (auteur ::text car UUID, publication directe).
	if !strings.Contains(frag, "u.id::text") || !strings.Contains(frag, "a.\"publicationId\"") {
		t.Error("fragment découverte articles : sujets auteur + publication attendus")
	}
}

func TestDiscoveryExclusionThought_AuthorOnly(t *testing.T) {
	frag := DiscoveryExclusionThought("u", "p")
	if strings.Contains(frag, "publication") {
		t.Error("fragment pensées : pas de sujet publication (les pensées n'en portent pas)")
	}
	if !strings.Contains(frag, "'limit_distribution'") {
		t.Error("fragment pensées : la limitation doit s'appliquer")
	}
}

func TestFollowingExclusion_HardBlockOnly(t *testing.T) {
	// Le flux suivi ne connaît que le refus dur : une limitation de
	// distribution n'y retire JAMAIS rien (freiner l'amplification ≠
	// défaire le choix du lecteur).
	for _, frag := range []string{FollowingExclusionArticle("u", "a"), FollowingExclusionThought("u", "p")} {
		if !strings.Contains(frag, "'suspend'") {
			t.Error("fragment suivi : le refus dur (suspend) doit s'appliquer")
		}
		if strings.Contains(frag, "limit_distribution") {
			t.Error("fragment suivi : limit_distribution ne doit JAMAIS y figurer")
		}
	}
}
