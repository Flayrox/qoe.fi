// Package workers — travaux d'arrière-plan et cycles de vie périodiques.
package workers

// =====================================================================
// 🗓️ Revue périodique des accès staff — travailleur d'arrière-plan (Phase 8)
// =====================================================================
// Exécute à intervalle régulier la capture de l'instantané mensuel des accès.
// L'action est idempotente : si la période en cours est déjà scellée,
// la passe ne fait rien.
// =====================================================================

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RunAccessReviewLoop exécute périodiquement l'instantané de revue des accès.
//
//   - snapshotFn : fonction qui génère et scelle la revue mensuelle si non existante.
//     Si nil, le travailleur ne tourne pas.
//   - interval : intervalle entre deux vérifications (par défaut 24 h).
func RunAccessReviewLoop(
	ctx context.Context,
	pool *pgxpool.Pool,
	interval time.Duration,
	snapshotFn func(context.Context) error,
) {
	if pool == nil || snapshotFn == nil {
		return
	}
	if interval <= 0 {
		interval = 24 * time.Hour
	}

	tick := func() {
		ctxTimeout, cancel := context.WithTimeout(ctx, 45*time.Second)
		defer cancel()

		if err := snapshotFn(ctxTimeout); err != nil {
			log.Printf("[access-review] cycle: %v", err)
			return
		}
	}

	tick()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tick()
		}
	}
}
