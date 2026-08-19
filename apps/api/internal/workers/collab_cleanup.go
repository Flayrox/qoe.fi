// Package workers — nettoyage périodique des documents de collaboration (Yjs).
package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CollabCleanup purge les documents Yjs (collab_documents) non touchés depuis
// maxAge. L'état canonique d'un article reste le HTML autosavé par le
// dashboard : un document Yjs purgé sera simplement re-créé vide puis
// re-seedé depuis le contenu de l'article au prochain éditeur — aucune perte.
func RunCollabCleanup(ctx context.Context, pool *pgxpool.Pool, interval, maxAge time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	run := func() {
		ctxTimeout, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()

		_, err := pool.Exec(ctxTimeout, `
			DELETE FROM collab_documents
			WHERE updated_at < now() - make_interval(secs => $1)`, maxAge.Seconds())
		if err != nil {
			log.Printf("collab cleanup: %v", err)
			return
		}
		log.Printf("collab cleanup: purge des documents Yjs inactifs depuis %v effectuée", maxAge)
	}

	run()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}
