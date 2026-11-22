package ai

// Lot L29W — le refus par le plafond global ne doit pas brûler le crédit
// mensuel de l'utilisateur (quota consommé pour une génération jamais faite).

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/subscriptions"
)

func TestAuditL29W_GlobalCapDoesNotBurnUserCredit(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()

	var uid string
	if err := poolTest.QueryRow(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES (gen_random_uuid(), 'ai-l29w@t.dev', 'ai-l29w', 'A', 'user', now(), now()) RETURNING id::text`).Scan(&uid); err != nil {
		t.Fatalf("user: %v", err)
	}
	t.Cleanup(func() {
		poolTest.Exec(ctx, `DELETE FROM "CapabilityBudget" WHERE ("scopeType" = 'global' AND "scopeId" = 'ai') OR "scopeId" = $1`, uid)
		poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, uid)
		poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1::uuid`, uid)
	})

	if _, err := subscriptions.GrantPlan(ctx, poolTest, subscriptions.SubjectUser, uid,
		subscriptions.PlanPlus, now, nil, "staff-test", "test", now); err != nil {
		t.Fatalf("octroi Plus: %v", err)
	}
	// Plafond global du jour saturé.
	if ok, err := abuse.ConsumeBudget(ctx, poolTest, "global", "ai", ActionAIGlobal,
		abuse.DailyWindow(now), DailyCapGlobal, DailyCapGlobal); err != nil || !ok {
		t.Fatalf("saturation du plafond global: ok=%v err=%v", ok, err)
	}

	svc := NewService(poolTest, fakeProvider{text: "x"})
	if _, err := svc.Explain(ctx, uid, "un extrait à expliquer", "fr"); !errors.Is(err, ErrAIGlobalQuota) {
		t.Fatalf("attendu ErrAIGlobalQuota, obtenu %v", err)
	}

	// Aucune ligne de budget utilisateur = aucun crédit consommé.
	consumed := 0
	err := poolTest.QueryRow(ctx, `SELECT "consumed" FROM "CapabilityBudget"
		WHERE "scopeType" = 'user_month' AND "scopeId" = $1 AND "action" = 'ai.request' AND "window" = $2`,
		uid, abuse.MonthlyWindow(now)).Scan(&consumed)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("lecture quota utilisateur: %v", err)
	}
	if consumed != 0 {
		t.Fatalf("refus par plafond global : %d crédit(s) mensuel(s) consommé(s), attendu 0", consumed)
	}
	if u := svc.UsageOf(ctx, uid); u.Remaining != MonthlyCapPerUser {
		t.Fatalf("quota restant annoncé = %d, attendu %d", u.Remaining, MonthlyCapPerUser)
	}
}
