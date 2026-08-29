package creator

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// ServiceQuerier est le queryer du handler créateur : le Querier sqlc
// généré. Abstrait pour permettre aux tests d'injecter des erreurs sur des
// méthodes précises (branches « return err » autrement inaccessibles).
type ServiceQuerier interface {
	db.Querier
}

var _ ServiceQuerier = (*db.Queries)(nil)

// pooler est la surface minimale de *pgxpool.Pool utilisée par le handler
// (requêtes brutes hors sqlc). Abstrait pour les mêmes raisons.
type pooler interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var _ pooler = (*pgxpool.Pool)(nil)
