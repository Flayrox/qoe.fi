// cmd/seed — données de démo (migration de packages/db/prisma/seed.ts).
//
// Usage : qoe-seed  (DATABASE_URL requis — même variable que l'API).
//
//	qoe-seed -top   régénère la DB « top du top » (reset complet +
//	users/articles/pensées/lectures + umami + embeddings).
//
// Logique dans internal/seed (testable) ; ici juste le bootstrap pgx.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/qoefi/api/internal/seed"
)

func main() {
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load()

	top := flag.Bool("top", false, "régénère la DB top du top (déterministe, reset complet)")
	noUmami := flag.Bool("no-umami", false, "-top : ne pas générer les événements Umami")
	noEmbed := flag.Bool("no-embed", false, "-top : ne pas générer les embeddings synchrones")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL non définie (ex: postgresql://user:pass@host:5432/db)")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("connexion: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping: %v", err)
	}

	if *top {
		res, err := seed.RunTop(ctx, pool, seed.TopOptions{})
		if err != nil {
			log.Fatalf("seed top: %v", err)
		}
		if !*noUmami {
			umamiDSN := os.Getenv("UMAMI_DATABASE_URL")
			if umamiDSN == "" {
				log.Println("⚠ UMAMI_DATABASE_URL non définie — umami skip")
			} else {
				umamiPool, err := pgxpool.New(ctx, umamiDSN)
				if err != nil {
					log.Fatalf("connexion umami: %v", err)
				}
				defer umamiPool.Close()
				if err := seed.RunTopUmami(ctx, umamiPool, res, seed.TopOptions{}); err != nil {
					log.Fatalf("seed umami: %v", err)
				}
			}
		}
		if !*noEmbed {
			if _, _, err := seed.EmbedTop(ctx, pool, res, os.Getenv("EMBEDDING_URL")); err != nil {
				log.Printf("⚠ embeddings: %v", err)
			}
		}
		parts := []string{"data"}
		if !*noUmami {
			parts = append(parts, "umami")
		}
		if !*noEmbed {
			parts = append(parts, "embeddings")
		}
		log.Printf("✅ Top DB régénérée (%s)", strings.Join(parts, " + "))
		return
	}

	if err := seed.Run(ctx, pool); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Println("Seed réussi pour les données dynamiques")
}
