package settings

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// ServiceQuerier est le queryer du service settings : le Querier sqlc
// généré. Le champ est déclaré abstrait pour permettre aux tests d'injecter
// des erreurs sur des méthodes précises (branches « return err »).
type ServiceQuerier interface {
	db.Querier
}

var _ ServiceQuerier = (*db.Queries)(nil)

// pooler est la surface minimale de *pgxpool.Pool utilisée par le service
// (UPDATE/INSERT/QueryRow bruts, hors sqlc). Abstrait pour les mêmes raisons
// que ServiceQuerier : un fake peut forcer des erreurs de connexion.
type pooler interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var _ pooler = (*pgxpool.Pool)(nil)
