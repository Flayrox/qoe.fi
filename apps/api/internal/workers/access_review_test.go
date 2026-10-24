package workers

import (
	"context"
	"testing"
	"time"
)

func TestAccessReview_WorkerExecution(t *testing.T) {
	// La boucle sort immédiatement quand le pool est nil (garde de sécurité),
	// donc sans base de test le test ne peut pas prouver l'invocation.
	requirePool(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	called := make(chan bool, 1)
	fn := func(_ context.Context) error {
		select {
		case called <- true:
		default:
		}
		return nil
	}

	// Un pool nil est ignoré par sécurité, mais avec un pool ou un test direct, vérifions l'invocation
	go RunAccessReviewLoop(ctx, poolTest, 50*time.Millisecond, fn)

	select {
	case <-called:
		// Succès : le worker a fait son tick
	case <-time.After(3 * time.Second):
		t.Fatal("le travailleur de revue n'a pas appelé snapshotFn dans le temps imparti")
	}
}
