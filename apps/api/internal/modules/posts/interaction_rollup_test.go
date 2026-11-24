package posts

import "testing"

// ─────────────────────────────────────────────────────────────────────────────
// Interaction (L45) — la cible est réelle, le rollup est explicitement nul.
// Une réaction sur un commentaire ne modifie jamais le post racine ni
// l'article. Renverser ce choix se fait en lecture (la donnée par cible existe
// déjà), jamais par un backfill. Ce test fige la règle.
// ─────────────────────────────────────────────────────────────────────────────

func TestInteractionTarget_IsTheRealTarget(t *testing.T) {
	comment := &FeedPost{ID: "c1", RootID: strPtr("root"), RootArticleID: strPtr("art-1")}

	kind, target := InteractionTargetOf(comment)
	if kind != "LIKE" || target != "c1" {
		t.Fatalf("la cible doit être le commentaire, obtenu kind=%q target=%q", kind, target)
	}
}

func TestInteractionRollup_IsExplicitlyNone(t *testing.T) {
	if RollupRule != RollupNone {
		t.Fatalf("rollup attendu %q, obtenu %q", RollupNone, RollupRule)
	}
}
