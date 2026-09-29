package abuse

// Budgets anti-abus (fiche 06 P0) : les plafonds de confirmations doivent
// tenir même en course — deux routes concurrentes ne dépassent jamais, et un
// plafond atteint n'est jamais une erreur (c'est la protection qui
// fonctionne).

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"
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

// scopeUnique isole chaque test dans son propre périmètre : les budgets sont
// persistants, deux tests ne doivent jamais partager une fenêtre.
func scopeUnique(t *testing.T) string {
	t.Helper()
	return fmt.Sprintf("test-%d-%s", time.Now().UnixNano(), t.Name())
}

func TestDailyWindow_Deterministic(t *testing.T) {
	a := time.Date(2026, 9, 29, 23, 59, 59, 0, time.FixedZone("CEST", 3600))
	b := time.Date(2026, 9, 30, 0, 0, 1, 0, time.FixedZone("CEST", 3600))
	if !DailyWindow(a).Equal(DailyWindow(b)) {
		t.Fatalf("deux instants du même jour UTC doivent donner la même fenêtre : %v vs %v",
			DailyWindow(a), DailyWindow(b))
	}
	if !DailyWindow(a).Equal(time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("fenêtre = minuit UTC, obtenu %v", DailyWindow(a))
	}
}

func TestConsumeBudget_NilPool_OpenDegradation(t *testing.T) {
	// Sans base (tests purs), le budget n'existe pas : on autorise. Une panne
	// de budget ne doit jamais bloquer une inscription légitime.
	ok, err := ConsumeBudget(context.Background(), nil, "publication", "x", ActionConfirmRequest, time.Now(), 1, 1)
	if err != nil || !ok {
		t.Fatalf("pool nil : attendu (true, nil), obtenu (%v, %v)", ok, err)
	}
	if !ConfirmAllowed(context.Background(), nil, "a@b.c", "pub", time.Now()) {
		t.Fatal("pool nil : ConfirmAllowed doit autoriser")
	}
}

func TestConsumeBudget_GrantsUpToCap(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	scope := scopeUnique(t)
	window := DailyWindow(time.Now())

	for i := 0; i < 3; i++ {
		ok, err := ConsumeBudget(ctx, poolTest, "test_scope", scope, ActionConfirmRequest, window, 1, 3)
		if err != nil || !ok {
			t.Fatalf("consommation %d/3 : attendu accord, obtenu (%v, %v)", i+1, ok, err)
		}
	}
	// 4e demande : plafond atteint — false SANS erreur.
	ok, err := ConsumeBudget(ctx, poolTest, "test_scope", scope, ActionConfirmRequest, window, 1, 3)
	if err != nil {
		t.Fatalf("plafond atteint : aucune erreur attendue, obtenu %v", err)
	}
	if ok {
		t.Fatal("plafond atteint : 4e consommation accordée, attendu refus")
	}
}

func TestConsumeBudget_ConcurrentNeverExceeds(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	scope := scopeUnique(t)
	window := DailyWindow(time.Now())

	// 20 goroutines se disputent un plafond de 5 : exactement 5 gagnent,
	// même en course. C'est l'invariant central du budget atomique.
	const racers = 20
	const cap = 5
	var granted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := ConsumeBudget(ctx, poolTest, "test_scope", scope, ActionConfirmRequest, window, 1, cap)
			if err != nil {
				t.Errorf("consommation concurrente : %v", err)
				return
			}
			if ok {
				granted.Add(1)
			}
		}()
	}
	wg.Wait()
	if got := granted.Load(); got != cap {
		t.Fatalf("course : %d consommations accordées pour un plafond de %d", got, cap)
	}
}

func TestConfirmAllowed_TwoScopes(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	email := fmt.Sprintf("victime-%d@example.com", time.Now().UnixNano())
	pub := scopeUnique(t)
	now := time.Now()

	// 3 demandes accordées (plafond adresse), la 4e refuse : l'adresse est
	// protégée contre le harcèlement par confirmations.
	for i := 0; i < ConfirmCapPerEmailPublication; i++ {
		if !ConfirmAllowed(ctx, poolTest, email, pub, now) {
			t.Fatalf("demande %d : attendu accord", i+1)
		}
	}
	if ConfirmAllowed(ctx, poolTest, email, pub, now) {
		t.Fatal("4e demande pour la même adresse : attendu refus (plafond adresse)")
	}
	// Une autre adresse de la même publication reste servie : le plafond
	// adresse ne punit pas les voisins.
	other := fmt.Sprintf("voisin-%d@example.com", time.Now().UnixNano())
	if !ConfirmAllowed(ctx, poolTest, other, pub, now) {
		t.Fatal("autre adresse : attendu accord (plafonds indépendants)")
	}
}
