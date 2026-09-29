package highlights

// Quota surlignages (fiche Plus) : 50 gratuits, illimités en Plus.
// Exige Postgres — skippé sans Docker. Le 51e est refusé (403 + code),
// l'octroi Plus rouvre, le compteur est exact (fini le hack len(1000)).

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/qoefi/api/internal/subscriptions"
	"github.com/qoefi/api/internal/testutil"
)

func TestHighlightQuota_FreeThenPlus(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	now := time.Now()

	// 50 surlignages d'un coup (1 INSERT multi-lignes), puis le 51e via Create.
	values := make([]string, 0, FreeHighlightQuota)
	for i := 0; i < FreeHighlightQuota; i++ {
		values = append(values, fmt.Sprintf("(gen_random_uuid()::text, 'passage %d', false, '%s'::uuid, '%s', now())",
			i, fx.ViewerID, fx.ArticleID))
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "readerId", "articleId", "createdAt") VALUES `+
			strings.Join(values, ",")); err != nil {
		t.Fatalf("seed 50: %v", err)
	}
	used, limit, plus := svc.HighlightQuota(ctx, fx.ViewerID)
	if used != 50 || limit != 50 || plus {
		t.Fatalf("quota (50, 50, false) attendu, obtenu (%d, %d, %v)", used, limit, plus)
	}
	if _, err := svc.Create(ctx, fx.ArticleID, fx.ViewerID, "un de trop", nil, false, 0); !errors.Is(err, ErrHighlightQuota) {
		t.Fatalf("51e : attendu ErrHighlightQuota, obtenu %v", err)
	}
	// Octroi Plus : rouvre + compteur illimité (-1).
	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, fx.ViewerID,
		subscriptions.PlanPlus, now, nil, "staff-test", "test quota", now); err != nil {
		t.Fatalf("octroi plus : %v", err)
	}
	used, limit, plus = svc.HighlightQuota(ctx, fx.ViewerID)
	if used != 50 || limit != -1 || !plus {
		t.Fatalf("quota (50, -1, true) attendu, obtenu (%d, %d, %v)", used, limit, plus)
	}
	if _, err := svc.Create(ctx, fx.ArticleID, fx.ViewerID, "51e autorisé", nil, false, 0); err != nil {
		t.Fatalf("51e en Plus : %v", err)
	}
	poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, fx.ViewerID)
}
