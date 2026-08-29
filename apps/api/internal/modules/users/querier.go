package users

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pooler est la surface minimale de *pgxpool.Pool utilisée par le service
// users (requêtes brutes). Abstrait pour permettre aux tests d'injecter des
// erreurs sur les branches « return err » autrement inaccessibles.
type pooler interface {
	Begin(ctx context.Context) (pgx.Tx, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var _ pooler = (*pgxpool.Pool)(nil)
