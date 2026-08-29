package analytics

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// ServiceQuerier est le queryer sqlc du service analytics. Abstrait pour
// permettre aux tests d'injecter des erreurs sur des méthodes précises.
type ServiceQuerier interface {
	db.Querier
}

var _ ServiceQuerier = (*db.Queries)(nil)

// pooler est la surface minimale de *pgxpool.Pool utilisée par le service
// (requêtes brutes + pool Umami en lecture seule). Abstrait pour les mêmes
// raisons : un fake peut forcer des erreurs de connexion.
type pooler interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var _ pooler = (*pgxpool.Pool)(nil)
