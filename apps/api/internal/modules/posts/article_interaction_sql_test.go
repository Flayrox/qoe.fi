package posts

import (
	"os"
	"strings"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// Preuve statique : les lectures de « liké par moi » et les écritures de
// réaction passent par Interaction, et ContentFeedback n'est plus écrit pour un
// like. Un grep exécuté par le test, pas une affirmation de commentaire.
// ─────────────────────────────────────────────────────────────────────────────

func TestNoReactionWriteOutsideInteraction(t *testing.T) {
	queries, err := os.ReadFile("../../../sql/queries/posts.sql")
	if err != nil {
		t.Fatalf("lecture posts.sql: %v", err)
	}
	text := string(queries)
	for _, forbidden := range []string{
		`INSERT INTO "Like"`,
		`DELETE FROM "Like"`,
		`INSERT INTO "ContentFeedback"`,
		`DELETE FROM "ContentFeedback"`,
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("écriture de réaction hors Interaction : %q", forbidden)
		}
	}

	service, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("lecture service.go: %v", err)
	}
	if strings.Contains(string(service), `"ContentFeedback"`) {
		t.Fatal("le service écrit encore ContentFeedback pour une réaction")
	}

	feed, err := os.ReadFile("../../../sql/queries/feed.sql")
	if err != nil {
		t.Fatalf("lecture feed.sql: %v", err)
	}
	if strings.Contains(string(feed), `JOIN "Like"`) {
		t.Fatal("le feed lit encore la table Like : le registre est Interaction")
	}
}
