package resilience

// Audit L30 : une fonction protégée qui panique tuait le processus (panic dans
// la goroutine d'appel). Le circuit breaker est justement là pour encaisser les
// défaillances d'une dépendance externe (Umami) : un panic doit être converti
// en échec compté, ouvrir le circuit au seuil, et rendre la main à l'appelant.

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestAuditL30_PanicDansExecute(t *testing.T) {
	cb := NewCircuitBreaker(Options{
		Name:             "audit-l30",
		FailureThreshold: 2,
		Cooldown:         time.Minute,
		CallTimeout:      time.Second,
	})
	boom := func(context.Context) error { panic("dépendance externe cassée") }

	for i := 0; i < 2; i++ {
		err := cb.Execute(context.Background(), boom)
		if !errors.Is(err, ErrCircuitPanic) {
			t.Fatalf("appel %d : err = %v, attendu ErrCircuitPanic (la panique doit être une défaillance, pas un crash)", i+1, err)
		}
	}
	if cb.State() != StateOpen {
		t.Fatalf("état après 2 paniques = %s, attendu %s", cb.State(), StateOpen)
	}
	// Circuit ouvert : plus aucun appel n'est tenté.
	if err := cb.Execute(context.Background(), boom); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("circuit ouvert : err = %v, attendu ErrCircuitOpen", err)
	}
}
