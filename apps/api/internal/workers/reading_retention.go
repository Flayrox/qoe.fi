// Package workers — rétention des sessions de lecture.
//
// Les sessions alimentent les statistiques Studio 7j/30j/90j : au-delà de
// 90 jours elles ne servent plus. Cette boucle, cadencée (défaut : toutes les
// heures), est le **seul** point de suppression de `ReadingSession` : le chemin
// chaud du tracking n'écrit plus de DELETE (il scannait la table à chaque
// lecture anonyme).
//
// La purge est faite par lots bornés pour ne pas tenir un verrou long ni
// saturer les WAL sur un gros volume.
package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReadingSessionRetention est la durée de conservation des sessions de lecture.
const ReadingSessionRetention = 90 * 24 * time.Hour

// readingSessionPurgeBatch borne chaque DELETE (lignes par lot).
const readingSessionPurgeBatch = 5000

// purgeReadingSessionsOnce supprime par lots les sessions plus anciennes que
// `retention` et retourne le nombre de lignes supprimées. `batchSize` <= 0
// reprend la valeur par défaut.
func purgeReadingSessionsOnce(ctx context.Context, pool *pgxpool.Pool, retention time.Duration, batchSize int) (int64, error) {
	if pool == nil {
		return 0, nil
	}
	if batchSize <= 0 {
		batchSize = readingSessionPurgeBatch
	}
	cutoff := time.Now().Add(-retention)

	var total int64
	for {
		tag, err := pool.Exec(ctx, `
			DELETE FROM "ReadingSession"
			WHERE id IN (
				SELECT id FROM "ReadingSession"
				WHERE "createdAt" < $1
				LIMIT $2
			)`, cutoff, batchSize)
		if err != nil {
			return total, err
		}
		n := tag.RowsAffected()
		total += n
		if n < int64(batchSize) || ctx.Err() != nil {
			return total, ctx.Err()
		}
	}
}

// RunReadingSessionRetention boucle la purge des sessions expirées toutes les
// `interval`. Le premier passage s'exécute au démarrage (rattrape l'arriéré
// accumulé pendant une coupure).
func RunReadingSessionRetention(ctx context.Context, pool *pgxpool.Pool, interval, retention time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	run := func() {
		start := time.Now()
		deleted, err := purgeReadingSessionsOnce(ctx, pool, retention, readingSessionPurgeBatch)
		if err != nil {
			log.Printf("[reading-retention] %v", err)
			return
		}
		if deleted > 0 {
			log.Printf("[reading-retention] %d sessions purgées (> %s) en %s",
				deleted, retention, time.Since(start).Round(time.Millisecond))
		}
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
