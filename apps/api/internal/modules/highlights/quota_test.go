package highlights

// Quota surlignages (fiche Plus) : 50 gratuits, illimités en Plus.
// Exige Postgres — skippé sans Docker. Le 51e est refusé (403 + code),
// l'octroi Plus rouvre, le compteur est exact (fini le hack len(1000)).

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

func TestHighlightQuota_Unlimited(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// 50 surlignages d'un coup (1 INSERT multi-lignes), puis le 51e via Create.
	values := make([]string, 0, 50)
	for i := 0; i < 50; i++ {
		values = append(values, fmt.Sprintf("(gen_random_uuid()::text, 'passage %d', false, '%s'::uuid, '%s', now())",
			i, fx.ViewerID, fx.ArticleID))
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "readerId", "articleId", "createdAt") VALUES `+
			strings.Join(values, ",")); err != nil {
		t.Fatalf("seed 50: %v", err)
	}
	used, limit, _, _ := svc.HighlightQuota(ctx, fx.ViewerID)
	if used != 50 || limit != -1 {
		t.Fatalf("quota (50, -1) attendu, obtenu (%d, %d)", used, limit)
	}
	if _, err := svc.Create(ctx, fx.ArticleID, fx.ViewerID, "51e autorisé pour tous", nil, false, 0); err != nil {
		t.Fatalf("51e : attendu sans erreur, obtenu %v", err)
	}
	poolTest.Exec(ctx, `DELETE FROM "Highlight" WHERE "readerId" = $1`, fx.ViewerID)
}
