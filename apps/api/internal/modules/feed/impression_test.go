package feed

import (
	"context"
	"testing"
)

func TestGetImpressionPenalties(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}

	// Trois impressions non-engagées sur l'article eng_art_a → pénalisé.
	for i := 0; i < 3; i++ {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "FeedImpression" (id, "userId", "itemType", "itemId")
			 VALUES (gen_random_uuid()::text, $1::uuid, 'ARTICLE', 'eng_art_a')`, readerID); err != nil {
			t.Fatalf("impression %d: %v", i, err)
		}
	}

	svc := newTestService()
	pens := svc.getImpressionPenalties(ctx, readerID, []string{"eng_art_a", "eng_art_b"}, nil)
	if !pens["eng_art_a"] {
		t.Fatalf("eng_art_a (3 impressions) doit être pénalisé: %v", pens)
	}
	if pens["eng_art_b"] {
		t.Fatalf("eng_art_b (0 impression) ne doit pas être pénalisé: %v", pens)
	}

	// Aucun item → no-op (aucune clé).
	if p := svc.getImpressionPenalties(ctx, readerID, nil, nil); len(p) != 0 {
		t.Fatalf("sans items, penalties = %v, attendu vide", p)
	}
	// Utilisateur vide → no-op.
	if p := svc.getImpressionPenalties(ctx, "", []string{"eng_art_a"}, nil); len(p) != 0 {
		t.Fatalf("userID vide, penalties = %v", p)
	}
}