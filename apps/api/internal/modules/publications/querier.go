package publications

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// pooler est la surface minimale du pool utilisée par Service (mockable en
// test — *pgxpool.Pool l'implémente en prod).
type pooler interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// compile-time check : *pgxpool.Pool satisfait pooler.
var _ pooler = (*pgxpool.Pool)(nil)
