// cmd/seed — données de démo (migration de packages/db/prisma/seed.ts).
//
// Usage : qoe-seed  (DATABASE_URL requis — même variable que l'API).
// Logique dans internal/seed (testable) ; ici juste le bootstrap pgx.
package main

import (
	"context"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/seed"
)

func main() {
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

	if err := seed.Run(ctx, pool); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Println("Seed réussi pour les données dynamiques")
}
