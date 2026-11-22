// Package workers — rétention des signaux de fonctionnalité.
//
// `FeatureSignal` ne sert qu'aux agrégats 90 jours du studio : au-delà de 180
// jours la ligne ne vaut plus rien. Cette boucle cadencée est désormais le
// **seul** point de suppression de la table : le service exécutait auparavant
// un DELETE global au premier signal « vue » du processus, donc sur le chemin
// de la réponse (scan complet, latence offerte au premier visiteur du jour).
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

// FeatureSignalRetention est la durée de conservation des signaux.
const FeatureSignalRetention = 180 * 24 * time.Hour

// featureSignalPurgeBatch borne chaque DELETE (lignes par lot).
const featureSignalPurgeBatch = 5000

// purgeFeatureSignalsOnce supprime par lots les signaux plus anciens que
// `retention` et retourne le nombre de lignes supprimées. `batchSize` <= 0
// reprend la valeur par défaut.
func purgeFeatureSignalsOnce(ctx context.Context, pool *pgxpool.Pool, retention time.Duration, batchSize int) (int64, error) {
	if pool == nil {
		return 0, nil
	}
	if batchSize <= 0 {
		batchSize = featureSignalPurgeBatch
	}
	cutoff := time.Now().Add(-retention)

	var total int64
	for {
		tag, err := pool.Exec(ctx, `
			DELETE FROM "FeatureSignal"
			WHERE id IN (
				SELECT id FROM "FeatureSignal"
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

// RunFeatureSignalRetention boucle la purge des signaux expirés toutes les
// `interval`. Le premier passage s'exécute au démarrage (rattrape l'arriéré
// accumulé pendant une coupure).
func RunFeatureSignalRetention(ctx context.Context, pool *pgxpool.Pool, interval, retention time.Duration) {
	if interval <= 0 {
		interval = 24 * time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	run := func() {
		start := time.Now()
		deleted, err := purgeFeatureSignalsOnce(ctx, pool, retention, featureSignalPurgeBatch)
		if err != nil {
			log.Printf("[feature-retention] %v", err)
			return
		}
		if deleted > 0 {
			log.Printf("[feature-retention] %d signaux purgés (> %s) en %s",
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
