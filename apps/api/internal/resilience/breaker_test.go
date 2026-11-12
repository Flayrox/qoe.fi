package resilience

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/qoefi/api/internal/observability"
)

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock(t time.Time) *fakeClock {
	return &fakeClock{now: t}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func TestCircuitBreakerClosedOpenHalfOpenClosed(t *testing.T) {
	reg := observability.NewRegistry()
	clk := newFakeClock(time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC))

	cb := NewCircuitBreaker(Options{
		Name:              "test-service",
		FailureThreshold:  3,
		Cooldown:          10 * time.Second,
		HalfOpenMaxProbes: 2,
		CallTimeout:       500 * time.Millisecond,
		Now:               clk.Now,
		Registry:          reg,
	})

	if cb.State() != StateClosed {
		t.Fatalf("état initial attendu %q, obtenu %q", StateClosed, cb.State())
	}

	boom := errors.New("upstream 500")
	ctx := context.Background()

	// 2 échecs puis 1 succès réinitialisent le compteur consécutif.
	for i := 0; i < 2; i++ {
		if err := cb.Execute(ctx, func(context.Context) error { return boom }); !errors.Is(err, boom) {
			t.Fatalf("appel %d: erreur attendue %v, obtenue %v", i, boom, err)
		}
	}
	if err := cb.Execute(ctx, func(context.Context) error { return nil }); err != nil {
		t.Fatalf("succès inattendu en erreur: %v", err)
	}
	if cb.State() != StateClosed {
		t.Fatalf("le circuit doit rester closed après réinitialisation, obtenu %q", cb.State())
	}

	// 3 échecs consécutifs ouvrent le circuit.
	for i := 0; i < 3; i++ {
		_ = cb.Execute(ctx, func(context.Context) error { return boom })
	}
	if cb.State() != StateOpen {
		t.Fatalf("état attendu %q après 3 échecs, obtenu %q", StateOpen, cb.State())
	}

	// Avant expiration du cooldown, fast-fail avec ErrCircuitOpen sans exécuter fn.
	var called atomic.Bool
	err := cb.Execute(ctx, func(context.Context) error {
		called.Store(true)
		return nil
	})
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("attendu ErrCircuitOpen, obtenu %v", err)
	}
	if called.Load() {
		t.Fatal("fn ne doit pas être appelée lorsque le circuit est open")
	}

	// Après cooldown, la première sonde passe en HalfOpen et la deuxième ferme le circuit.
	clk.Advance(10 * time.Second)
	if err := cb.Execute(ctx, func(context.Context) error { return nil }); err != nil {
		t.Fatalf("sonde 1 half-open échouée: %v", err)
	}
	if cb.State() != StateHalfOpen {
		t.Fatalf("état attendu %q après 1/2 sondes réussies, obtenu %q", StateHalfOpen, cb.State())
	}
	if err := cb.Execute(ctx, func(context.Context) error { return nil }); err != nil {
		t.Fatalf("sonde 2 half-open échouée: %v", err)
	}
	if cb.State() != StateClosed {
		t.Fatalf("état attendu %q après 2/2 sondes réussies, obtenu %q", StateClosed, cb.State())
	}

	metrics := reg.Render()
	if !strings.Contains(metrics, `qoe_circuit_breaker_state{name="test-service",state="closed"} 1`) {
		t.Fatalf("métrique d'état closed manquante:\n%s", metrics)
	}
	if !strings.Contains(metrics, `qoe_circuit_breaker_trips_total{name="test-service"} 1`) {
		t.Fatalf("métrique trips_total=1 manquante:\n%s", metrics)
	}
}

func TestCircuitBreakerHalfOpenProbeFailureReopens(t *testing.T) {
	reg := observability.NewRegistry()
	clk := newFakeClock(time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC))

	cb := NewCircuitBreaker(Options{
		Name:              "reopen-service",
		FailureThreshold:  2,
		Cooldown:          5 * time.Second,
		HalfOpenMaxProbes: 2,
		CallTimeout:       500 * time.Millisecond,
		Now:               clk.Now,
		Registry:          reg,
	})

	ctx := context.Background()
	boom := errors.New("fail")

	_ = cb.Execute(ctx, func(context.Context) error { return boom })
	_ = cb.Execute(ctx, func(context.Context) error { return boom })
	if cb.State() != StateOpen {
		t.Fatalf("état attendu open, obtenu %q", cb.State())
	}

	clk.Advance(5 * time.Second)

	// Sonde en échec -> réouverture immédiate en StateOpen.
	err := cb.Execute(ctx, func(context.Context) error { return boom })
	if !errors.Is(err, boom) {
		t.Fatalf("erreur sonde attendue %v, obtenue %v", boom, err)
	}
	if cb.State() != StateOpen {
		t.Fatalf("état attendu open après échec sonde, obtenu %q", cb.State())
	}

	// Fast-fail immédiat avant le nouveau cooldown.
	if err := cb.Execute(ctx, func(context.Context) error { return nil }); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("attendu ErrCircuitOpen après réouverture, obtenu %v", err)
	}

	metrics := reg.Render()
	if !strings.Contains(metrics, `qoe_circuit_breaker_state{name="reopen-service",state="open"} 1`) {
		t.Fatalf("métrique d'état open manquante:\n%s", metrics)
	}
	if !strings.Contains(metrics, `qoe_circuit_breaker_trips_total{name="reopen-service"} 2`) {
		t.Fatalf("métrique trips_total=2 manquante:\n%s", metrics)
	}
}

func TestCircuitBreakerHalfOpenMaxProbesQuota(t *testing.T) {
	reg := observability.NewRegistry()
	clk := newFakeClock(time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC))

	cb := NewCircuitBreaker(Options{
		Name:              "quota-service",
		FailureThreshold:  1,
		Cooldown:          5 * time.Second,
		HalfOpenMaxProbes: 2,
		CallTimeout:       2 * time.Second,
		Now:               clk.Now,
		Registry:          reg,
	})

	ctx := context.Background()
	_ = cb.Execute(ctx, func(context.Context) error { return errors.New("down") })
	clk.Advance(5 * time.Second)

	gate := make(chan struct{})
	started := make(chan struct{}, 2)
	var wg sync.WaitGroup

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = cb.Execute(ctx, func(context.Context) error {
				started <- struct{}{}
				<-gate
				return nil
			})
		}()
	}

	<-started
	<-started

	// Une 3e sonde concurrente doit être rejetée par ErrCircuitOpen.
	err := cb.Execute(ctx, func(context.Context) error { return nil })
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("3e sonde half-open attendue ErrCircuitOpen, obtenu %v", err)
	}

	close(gate)
	wg.Wait()

	if cb.State() != StateClosed {
		t.Fatalf("état attendu closed après 2 sondes réussies, obtenu %q", cb.State())
	}
}

func TestCircuitBreakerTimeoutEnforcement(t *testing.T) {
	reg := observability.NewRegistry()
	cb := NewCircuitBreaker(Options{
		Name:             "timeout-service",
		FailureThreshold: 2,
		Cooldown:         10 * time.Second,
		CallTimeout:      25 * time.Millisecond,
		Registry:         reg,
	})

	ctx := context.Background()
	for i := 0; i < 2; i++ {
		start := time.Now()
		err := cb.Execute(ctx, func(context.Context) error {
			time.Sleep(150 * time.Millisecond)
			return nil
		})
		elapsed := time.Since(start)
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("appel %d: attendu context.DeadlineExceeded, obtenu %v", i, err)
		}
		if elapsed > 120*time.Millisecond {
			t.Fatalf("timeout trop lent (%v)", elapsed)
		}
	}

	if cb.State() != StateOpen {
		t.Fatalf("2 timeouts doivent ouvrir le circuit, obtenu %q", cb.State())
	}
}

func TestCircuitBreakerConcurrencyRace(t *testing.T) {
	reg := observability.NewRegistry()
	clk := newFakeClock(time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC))

	cb := NewCircuitBreaker(Options{
		Name:              "race-service",
		FailureThreshold:  5,
		Cooldown:          10 * time.Millisecond,
		HalfOpenMaxProbes: 2,
		CallTimeout:       50 * time.Millisecond,
		Now:               clk.Now,
		Registry:          reg,
	})

	const workers = 16
	const iters = 50
	var wg sync.WaitGroup
	wg.Add(workers)

	for w := 0; w < workers; w++ {
		go func(id int) {
			defer wg.Done()
			for i := 0; i < iters; i++ {
				if i%7 == 0 {
					clk.Advance(15 * time.Millisecond)
				}
				_ = cb.Execute(context.Background(), func(context.Context) error {
					if (id+i)%3 == 0 {
						return errors.New("intermittent")
					}
					return nil
				})
				_ = cb.State()
			}
		}(w)
	}

	wg.Wait()
}
