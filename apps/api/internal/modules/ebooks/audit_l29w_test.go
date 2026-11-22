package ebooks

// Lot L29W — une panne de lecture ne doit être ni « livre introuvable » (404)
// ni « réservé aux Plus » (403).

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

const auditUser = "00000000-0000-0000-0000-0000000000aa"

func TestAuditL29W_ReadOutageIsNotNotFound(t *testing.T) {
	svc := NewService(unreachablePool(t))
	ctx := context.Background()

	if _, err := svc.Get(ctx, auditUser, "livre-1"); errors.Is(err, ErrEbookNotFound) {
		t.Fatal("panne DB rendue en « livre introuvable » (404)")
	}
	if _, _, err := svc.Cover(ctx, auditUser, "livre-1"); errors.Is(err, ErrEbookNotFound) {
		t.Fatal("panne DB de la couverture rendue en « livre introuvable » (404)")
	}
}

func TestAuditL29W_OfflineOutageIsNotPlusRequired(t *testing.T) {
	svc := NewService(unreachablePool(t))
	if _, err := svc.OfflinePack(context.Background(), auditUser, "livre-1"); errors.Is(err, ErrEbookOfflinePlusRequired) {
		t.Fatal("panne DB rendue en « réservé aux Plus » (403)")
	}
}
