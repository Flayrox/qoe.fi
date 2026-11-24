package posts

import "testing"

// ─────────────────────────────────────────────────────────────────────────────
// Réaction d'article (L45) — targetType ARTICLE n'est plus une valeur morte.
// Le like d'article écrit dans le MÊME registre que les posts, avec une cible
// ARTICLE ; les feeds lisent ensuite ce registre, jamais ContentFeedback.
// ─────────────────────────────────────────────────────────────────────────────

func TestArticleReactionTarget_UsesTheInteractionLedger(t *testing.T) {
	kind, targetType, targetID := ArticleReactionTarget("artc_42")
	if kind != "LIKE" {
		t.Fatalf("nature attendue LIKE, obtenue %q", kind)
	}
	if targetType != "ARTICLE" {
		t.Fatalf("une réaction d'article doit viser ARTICLE, obtenu %q", targetType)
	}
	if targetID != "artc_42" {
		t.Fatalf("cible attendue artc_42, obtenue %q", targetID)
	}
}
