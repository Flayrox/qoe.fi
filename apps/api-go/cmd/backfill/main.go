// cmd/backfill — outil d'exploitation : enqueue les jobs d'embedding pour les
// articles publiés existants (le hook article.published ne couvre que les
// nouvelles publications). Idempotent : par défaut ne re-traite que les
// articles SANS vecteur ; `-force` ré-enqueue tout (ré-embedding complet).
//
// Usage :
//   cd apps/api-go && go run ./cmd/backfill            # articles sans vecteur
//   cd apps/api-go && go run ./cmd/backfill -force     # tout ré-enqueuer
package main

import (
	"context"
	"flag"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"

	"github.com/qoefi/api-go/internal/config"
	"github.com/qoefi/api-go/internal/dbpool"
	"github.com/qoefi/api-go/internal/queue"
)

func main() {
	force := flag.Bool("force", false, "ré-enqueuer TOUS les articles publiés (ré-embedding complet)")
	flag.Parse()

	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load()

	cfg := config.Load()
	ctx := context.Background()

	pool, err := dbpool.New(ctx, cfg.DatabaseURL, 4)
	if err != nil {
		log.Fatalf("connexion base de données: %v", err)
	}
	defer pool.Close()

	ac := queue.NewClient(cfg.RedisURL)
	if ac == nil {
		log.Fatal("URL Redis invalide — impossible d'enqueuer (REDIS_URL?)")
	}
	defer ac.Close()

	// Articles publiés sans vecteur (backfill) — ou tous si -force.
	var rows pgx.Rows
	if *force {
		rows, err = pool.Query(ctx, `SELECT id FROM "Article" WHERE published = true`)
	} else {
		rows, err = pool.Query(ctx, `SELECT id FROM "Article" WHERE published = true AND "embedding" IS NULL`)
	}
	if err != nil {
		log.Fatalf("requête articles: %v", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			log.Fatalf("scan: %v", err)
		}
		ids = append(ids, id)
	}
	if rows.Err() != nil {
		log.Fatalf("lecture articles: %v", rows.Err())
	}

	if len(ids) == 0 {
		log.Println("aucun article à enqueuer (backfill déjà fait ?)")
		return
	}

	// Enqueue en continu (queue "low", retry 5, timeout 120 s — même config
	// que le hook article.published).
	for i, id := range ids {
		if err := queue.PublishArticleEmbedding(ac, queue.EmbeddingPayload{ArticleID: id}); err != nil {
			log.Printf("enqueue %s: %v", id, err)
			continue
		}
		if (i+1)%25 == 0 {
			log.Printf("%d/%d enqueués…", i+1, len(ids))
		}
	}
	log.Printf("✅ %d tâches embedding.article enqueuées (%s)", len(ids),
		map[bool]string{true: "force: ré-embedding complet", false: "backfill sans vecteur"}[*force])
}
