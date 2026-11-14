package flags

// =====================================================================
// 🚩 Registre fermé : Known & Keys
// =====================================================================
// Les écritures admin refusent un flag fantôme (Known), et l'interface liste
// les clés connues pour construire l'écran de pilotage (Keys). Ces deux
// fonctions définissent donc la surface PUBLIQUE du registre : elles restent
// testées ici, sans base, car elles ne dépendent que du registre compilé.
// =====================================================================

import (
	"sort"
	"testing"
)

func TestKnown_ReconnaitLeRegistreEtRefuseUnFantome(t *testing.T) {
	for _, key := range []string{
		FeedRecommendations,
		WebNewsletterBanner,
		DashboardAITitle,
		AdminAuditLog,
		WorkersNewsletter,
		AuthzEnforce,
		AbuseSignupKill,
		ReaderPlusBanner,
		ReaderEbooksUpload,
	} {
		if !Known(key) {
			t.Fatalf("Known(%q) = false : une clé déclarée doit être connue", key)
		}
	}

	// Un flag qui n'existe pas ne doit jamais être accepté en écriture : la
	// table ne doit pas devenir un dépotoir de clés inventées.
	for _, phantom := range []string{"", "flag-fantome", "FEED_RECOMMENDATIONS", "feed-recommendation"} {
		if Known(phantom) {
			t.Fatalf("Known(%q) = true : clé inconnue acceptée", phantom)
		}
	}
}

func TestKeys_ListeTrieeSansDoublon(t *testing.T) {
	keys := Keys()
	if len(keys) == 0 {
		t.Fatal("Keys() vide : le registre est illisible")
	}
	if !sort.StringsAreSorted(keys) {
		t.Fatalf("Keys() non trié : %v", keys)
	}
	seen := map[string]bool{}
	for _, k := range keys {
		if seen[k] {
			t.Fatalf("clé répétée dans Keys() : %q", k)
		}
		seen[k] = true
		if !Known(k) {
			t.Fatalf("Keys() expose %q, que Known refuse", k)
		}
	}
	// Le registre compilé et la liste retournée doivent décrire le même
	// ensemble : une clé ajoutée dans defaults sans passer par Keys serait
	// invisible pour l'écran de pilotage.
	if len(seen) != len(defaults) {
		t.Fatalf("Keys() = %d clés, defaults en déclare %d", len(seen), len(defaults))
	}
}
