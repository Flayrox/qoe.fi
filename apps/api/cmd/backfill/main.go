// cmd/backfill — outil d'exploitation : enqueue les jobs d'embedding pour les
// articles publiés existants (le hook article.published ne couvre que les
// nouvelles publications) et re-synchronise l'index Meilisearch. Idempotent :
// par défaut ne re-traite que les articles SANS vecteur ; `-force` ré-enqueue
// tout (ré-embedding complet) ; `-meili` ne upsert que les documents manquants.
//
// Usage :
//   cd apps/api && go run ./cmd/backfill            # articles sans vecteur
//   cd apps/api && go run ./cmd/backfill -force     # tout ré-enqueuer
//   cd apps/api && go run ./cmd/backfill -meili     # reindex Meilisearch
package main

import (
	"context"
	"flag"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"

	"github.com/qoefi/api/internal/config"
	"github.com/qoefi/api/internal/dbpool"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/workers"
)

func main() {
	force := flag.Bool("force", false, "ré-enqueuer TOUS les articles publiés (ré-embedding complet)")
	meili := flag.Bool("meili", false, "re-synchroniser l'index Meilisearch (upsert idempotent des documents manquants)")
	users := flag.Bool("users", false, "enqueuer les embeddings users manquants (WHERE embedding IS NULL)")
	posts := flag.Bool("posts", false, "enqueuer les embeddings de pensées manquants (WHERE embedding IS NULL)")
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

	if *meili {
		w := workers.NewSearchWorker(pool)
		total, upserted, err := w.ReindexAll(ctx)
		if err != nil {
			log.Fatalf("reindex meilisearch: %v", err)
		}
		log.Printf("✅ Meilisearch à jour : %d articles en base, %d documents upsertés", total, upserted)
		return
	}

	if *users {
		rows, err := pool.Query(ctx, `SELECT id FROM "User" WHERE "embedding" IS NULL`)
		if err != nil {
			log.Fatalf("requête users: %v", err)
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				log.Fatalf("scan user: %v", err)
			}
			ids = append(ids, id)
		}
		if rows.Err() != nil {
			log.Fatalf("lecture users: %v", rows.Err())
		}
		if len(ids) == 0 {
			log.Println("aucun user à enqueuer (embeddings users déjà faits ?)")
			return
		}
		for i, id := range ids {
			if err := queue.PublishUserEmbedding(ac, queue.EmbeddingPayload{UserID: id}); err != nil {
				log.Printf("enqueue %s: %v", id, err)
			}
			if (i+1)%50 == 0 {
				log.Printf("%d/%d users enqueués…", i+1, len(ids))
			}
		}
		log.Printf("✅ %d tâches embedding.user enqueuées", len(ids))
		return
	}

	if *posts {
		rows, err := pool.Query(ctx, `SELECT id FROM "Post"
			WHERE "embedding" IS NULL AND "deletedAt" IS NULL
			  AND "isDraft" = false AND "isHiddenByAuthor" = false`)
		if err != nil {
			log.Fatalf("requête posts: %v", err)
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				log.Fatalf("scan post: %v", err)
			}
			ids = append(ids, id)
		}
		if rows.Err() != nil {
			log.Fatalf("lecture posts: %v", rows.Err())
		}
		if len(ids) == 0 {
			log.Println("aucun post à enqueuer (embeddings pensées déjà faits ?)")
			return
		}
		for i, id := range ids {
			if err := queue.PublishPostEmbedding(ac, queue.EmbeddingPayload{PostID: id}); err != nil {
				log.Printf("enqueue %s: %v", id, err)
			}
			if (i+1)%100 == 0 {
				log.Printf("%d/%d posts enqueués…", i+1, len(ids))
			}
		}
		log.Printf("✅ %d tâches embedding.post enqueuées", len(ids))
		return
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
