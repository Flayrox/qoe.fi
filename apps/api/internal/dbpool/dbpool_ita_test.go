package dbpool

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

// TestNew_Success démarre une vraie base PostgreSQL (testcontainers) et
// vérifie que New configure correctement le pool : DSN résolu, taille de pool
// appliquée, mode PgBouncer-compatible et Ping effectif.
func TestNew_Success(t *testing.T) {
	ctx := context.Background()

	// Harnais partagé : monte un conteneur pgvector ephemere.
	p := testutil.MustPool(t)

	dsn := p.Config().ConnString()
	if dsn == "" {
		t.Fatal("DSN du pool de test vide")
	}

	created, err := New(ctx, dsn, 4)
	if err != nil {
		t.Fatalf("New (succès) = %v", err)
	}
	defer created.Close()

	// Le pool doit répondre (Ping a déjà été passé par New).
	if err := created.Ping(ctx); err != nil {
		t.Fatalf("Ping du pool créé: %v", err)
	}
	cfg := created.Config()
	if cfg.MaxConns != 4 {
		t.Errorf("MaxConns = %d, attendu 4", cfg.MaxConns)
	}
	if cfg.MinConns != 2 {
		t.Errorf("MinConns = %d, attendu 2", cfg.MinConns)
	}
	// Mode PgBouncer-compatible : pas de cache de prepared statements nommés.
	if cfg.ConnConfig.StatementCacheCapacity != 0 {
		t.Errorf("StatementCacheCapacity = %d, attendu 0 (PgBouncer)", cfg.ConnConfig.StatementCacheCapacity)
	}
}