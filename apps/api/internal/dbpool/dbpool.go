// Package dbpool fournit le pool de connexions PostgreSQL (pgx).
package dbpool

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// New crée et valide un pool pgx calibré pour un VPS.
func New(ctx context.Context, url string, poolSize int32) (*pgxpool.Pool, error) {
	if url == "" {
		return nil, fmt.Errorf("DATABASE_URL est vide")
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	cfg.MaxConns = poolSize
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	// pgxpool gère le health check ; on calibre aussi les timeouts.
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second

	// Compatibilité PgBouncer / Supabase transaction pooler :
	// Désactive le cache de prepared statements nommés ("stmtcache_...") qui échoue
	// en mode transaction (SQLSTATE 26000).
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.ConnConfig.StatementCacheCapacity = 0

	// Garde-fous anti-saturation DB : aucune requête pathologique (> 10 s) ni
	// transaction abandonnée (> 30 s) ne doit immobiliser le pool ou Postgres.
	// Appliqué via AfterConnect (best-effort) pour rester 100 % compatible avec
	// PgBouncer en mode transaction sans rejeter les paramètres de démarrage.
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		tCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		_, _ = conn.Exec(tCtx, "SET statement_timeout = 10000; SET idle_in_transaction_session_timeout = 30000")
		return nil
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return pool, nil
}
