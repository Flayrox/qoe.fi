package subscriptions

// Octrois manuels (intérim Stripe) : validés purs sans base ; cycle DB
// (skippé sans Docker). L'ouverture ne change rien n'a pas d'équivalent
// ici — mais l'effectivité est purement temporelle (startsAt/endsAt),
// vérifiée à chaque cas.

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

func TestValidPlanSubject(t *testing.T) {
	for _, p := range []string{"pro", "plus"} {
		if !ValidPlan(p) {
			t.Errorf("plan %s doit être valide", p)
		}
	}
	if ValidPlan("premium") || ValidPlan("") {
		t.Error("plans inconnus refusés")
	}
	for _, s := range []string{"user", "publication"} {
		if !ValidSubject(s) {
			t.Errorf("sujet %s doit être valide", s)
		}
	}
	if ValidSubject("org") || ValidSubject("") {
		t.Error("sujets inconnus refusés")
	}
}

func TestHasEntitlement_NilPool_Denies(t *testing.T) {
	// Inverse des budgets : sans base, PAS de droits (défaut sûr).
	if HasEntitlement(context.Background(), nil, SubjectPublication, "x", PlanPro, time.Now()) {
		t.Fatal("pool nil : aucun droit attendu")
	}
	if HasPro(context.Background(), nil, "x", time.Now()) {
		t.Fatal("pool nil : pas de Pro attendu")
	}
}

func TestGrant_Cycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	sub := fmt.Sprintf("pub-grant-%d", now.UnixNano())
	staff := "staff-grant-1"

	if _, err := GrantPlan(ctx, poolTest, "org", sub, PlanPro, now, nil, staff, "", now); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("sujet inconnu : attendu ErrInvalidGrant, obtenu %v", err)
	}
	if _, err := GrantPlan(ctx, poolTest, SubjectPublication, sub, "premium", now, nil, staff, "", now); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("plan inconnu : attendu ErrInvalidGrant, obtenu %v", err)
	}
	past := now.Add(-time.Hour)
	if _, err := GrantPlan(ctx, poolTest, SubjectPublication, sub, PlanPro, now, &past, staff, "", now); !errors.Is(err, ErrInvalidGrant) {
		t.Fatalf("fin avant début : attendu ErrInvalidGrant, obtenu %v", err)
	}
	if _, err := RevokeGrant(ctx, poolTest, "00000000-0000-0000-0000-000000000000", now); !errors.Is(err, ErrGrantNotFound) {
		t.Fatalf("inexistant : attendu ErrGrantNotFound, obtenu %v", err)
	}

	// Octroi programmé (début futur) : pas effectif.
	future := now.Add(2 * time.Hour)
	g, err := GrantPlan(ctx, poolTest, SubjectPublication, sub, PlanPro, future, nil, staff, "presse", now)
	if err != nil {
		t.Fatalf("octroi programmé : %v", err)
	}
	if g.Effective {
		t.Fatal("programmé : non effectif attendu")
	}
	if HasPro(ctx, poolTest, sub, now) {
		t.Fatal("programmé : HasPro faux attendu")
	}
	// Le futur n'empêche pas un octroi immédiat parallèle (deux lignes).
	g2, err := GrantPlan(ctx, poolTest, SubjectPublication, sub, PlanPro, now.Add(-time.Minute), nil, staff, "urgence", now)
	if err != nil {
		t.Fatalf("octroi immédiat : %v", err)
	}
	if !g2.Effective || !HasPro(ctx, poolTest, sub, now) {
		t.Fatal("immédiat : effectif attendu")
	}

	// Liste : historique complet + filtre effectifs.
	all, err := ListGrants(ctx, poolTest, SubjectPublication, sub, false, 10, now)
	if err != nil || len(all) != 2 {
		t.Fatalf("historique (2) attendu, obtenu %d (%v)", len(all), err)
	}
	eff, err := ListGrants(ctx, poolTest, SubjectPublication, sub, true, 10, now)
	if err != nil || len(eff) != 1 || eff[0].ID != g2.ID {
		t.Fatalf("1 effectif attendu, obtenu %+v (%v)", eff, err)
	}
	recent, total, err := ListRecentGrants(ctx, poolTest, PlanPro, false, 10, 0, now)
	if err != nil || total < 2 {
		t.Fatalf("file récente (≥2) attendue, obtenu %d (%v)", total, err)
	}
	_ = recent

	// Révocation : fin immédiate, historique conservé, idempotente.
	r, err := RevokeGrant(ctx, poolTest, g2.ID, now)
	if err != nil {
		t.Fatalf("révocation : %v", err)
	}
	if r.Effective {
		t.Fatalf("révoqué non effectif attendu, obtenu %+v", r)
	}
	if HasPro(ctx, poolTest, sub, now) {
		t.Fatal("révoqué : HasPro faux attendu (l'octroi programmé ne compte pas encore)")
	}
	r2, err := RevokeGrant(ctx, poolTest, g2.ID, now)
	if err != nil || r2.ID != g2.ID {
		t.Fatalf("re-révocation idempotente : %v", err)
	}

	// Non-régression arrondi ms (TIMESTAMP(3) arrondit, ne tronque pas) :
	// une révocation immédiate est inactive DÈS sa milliseconde, même
	// répétée (les deux sens d'arrondi sont exercés en boucle).
	for i := 0; i < 5; i++ {
		rs := fmt.Sprintf("%s-rev-%d", sub, i)
		rg, err := GrantPlan(ctx, poolTest, SubjectPublication, rs, PlanPro, now, nil, staff, "", now)
		if err != nil {
			t.Fatalf("octroi %d : %v", i, err)
		}
		if _, err := RevokeGrant(ctx, poolTest, rg.ID, time.Now()); err != nil {
			t.Fatalf("révocation %d : %v", i, err)
		}
		if HasPro(ctx, poolTest, rs, time.Now()) {
			t.Fatalf("révoqué %d encore actif (arrondi ms ?)", i)
		}
		poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, rs)
	}

	// Nettoyage (tag unique).
	poolTest.Exec(ctx, `DELETE FROM "SubscriptionGrant" WHERE "subjectId" = $1`, sub)
}
