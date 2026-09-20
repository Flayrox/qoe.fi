// Package workers — cycle de vie des images (MediaAsset).
//
// Le registre MediaAsset suit chaque image uploadée (DRAFT_ORPHAN, TTL 3j).
// Cette boucle, cadencée (défaut : toutes les heures) :
//  1. collecte les URLs réellement référencées par les tables métier
//     (couvertures, contenus inline, avatars, bannières, promos, OAuth) ;
//  2. réconcilie : attache les orphelins devenus utilisés, détache
//     (SOFT_DELETED + grâce) ceux qui ne sont plus référencés nulle part
//     (image remplacée, article/promo supprimé, upload abandonné) ;
//  3. purge les expirés : suppression de l'objet storage puis marquage
//     PURGED (idempotent : un objet déjà absent n'empêche pas la purge DB).
package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/modules/mediaassets"
)

// scalarImageColumns liste les colonnes d'URL d'image des tables métier.
// Toute URL qui disparaît de ces colonnes cesse d'être référencée.
var scalarImageColumns = []struct {
	table  string
	column string
}{
	{`"User"`, `"logoUrl"`},
	{`"Publication"`, `"logoUrl"`},
	{`"Publication"`, `"headerImageUrl"`},
	{`"Article"`, `"imageUrl"`},
	{`"Post"`, `"imageUrl"`},
	{`"PartnerPromo"`, `"imageUrl"`},
	{`"OAuthClient"`, `"logoUrl"`},
}

// collectReferencedImageURLs rassemble toutes les URLs d'images référencées :
// colonnes scalaires + balises <img> des contenus d'articles.
func collectReferencedImageURLs(ctx context.Context, pool *pgxpool.Pool) ([]string, error) {
	seen := map[string]struct{}{}
	add := func(urls ...string) {
		for _, u := range urls {
			if u == "" {
				continue
			}
			seen[u] = struct{}{}
		}
	}

	for _, col := range scalarImageColumns {
		rows, err := pool.Query(ctx,
			`SELECT `+col.column+` FROM `+col.table+` WHERE `+col.column+` IS NOT NULL AND `+col.column+` <> ''`)
		if err != nil {
			return nil, err
		}
		var url string
		for rows.Next() {
			if serr := rows.Scan(&url); serr != nil {
				rows.Close()
				return nil, serr
			}
			add(url)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	// Images inline des corps d'articles (<img src="…">).
	rows, err := pool.Query(ctx, `SELECT "content" FROM "Article" WHERE "content" LIKE '%<img%'`)
	if err != nil {
		return nil, err
	}
	var content string
	for rows.Next() {
		if serr := rows.Scan(&content); serr != nil {
			rows.Close()
			return nil, serr
		}
		add(mediaassets.ExtractImageURLs(content)...)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]string, 0, len(seen))
	for u := range seen {
		out = append(out, u)
	}
	return out, nil
}

// runMediaLifecycleOnce exécute un passage complet (références → réconcile →
// purge). Séparé de la boucle pour être testable.
func runMediaLifecycleOnce(
	ctx context.Context,
	pool *pgxpool.Pool,
	svc *mediaassets.Service,
	deleter mediaassets.StorageDeleter,
	softDeleteGrace time.Duration,
) (attached, detached int64, purged int, err error) {
	ctxTimeout, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	refs, err := collectReferencedImageURLs(ctxTimeout, pool)
	if err != nil {
		return 0, 0, 0, err
	}
	attached, detached, err = svc.Reconcile(ctxTimeout, refs, softDeleteGrace)
	if err != nil {
		return attached, detached, 0, err
	}
	purged, err = svc.PurgeExpired(ctxTimeout, deleter, 0)
	if err != nil {
		return attached, detached, purged, err
	}
	return attached, detached, purged, nil
}

// RunMediaLifecycle boucle le cycle de vie des médias : réconciliation puis
// purge, toutes les `interval`. Le premier passage s'exécute au démarrage
// (rattrape les orphelins accumulés pendant une coupure).
func RunMediaLifecycle(
	ctx context.Context,
	pool *pgxpool.Pool,
	svc *mediaassets.Service,
	deleter mediaassets.StorageDeleter,
	interval, softDeleteGrace time.Duration,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	run := func() {
		attached, detached, purged, err := runMediaLifecycleOnce(ctx, pool, svc, deleter, softDeleteGrace)
		if err != nil {
			log.Printf("[media-lifecycle] %v", err)
			return
		}
		if attached+detached > 0 || purged > 0 {
			log.Printf("[media-lifecycle] attachés=%d détachés=%d purgés=%d", attached, detached, purged)
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
