package adminauthz

// Audit L33 — rouge de reproduction (exécuté à f51e63e0 avant correctif).

import (
	"context"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

type noopExecer struct{}

func (noopExecer) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

// `Observe` teste `closed` puis envoie sur le canal ; `Close` ferme le canal
// après le même test. Une décision qui arrive entre les deux provoque un
// « send on closed channel » — un panic qui tue le processus au pire moment
// (arrêt du serveur, tampon qui se vide sous charge).
func TestAuditL33_RecorderObserveVsCloseNoPanic(t *testing.T) {
	for i := 0; i < 200; i++ {
		r := NewRecorder(noopExecer{})
		stop := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					r.Observe(Decision{Capability: SelfRead, Allowed: true, Mode: ModeEnforce}, "u1")
				}
			}
		}()
		r.Close()
		close(stop)
		wg.Wait()
	}
}
