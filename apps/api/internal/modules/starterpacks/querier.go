package starterpacks

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// pooler : surface minimale du pool utilisée par Service (mockable en test).
type pooler interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

var _ pooler = (*pgxpool.Pool)(nil)

// starterQuerier : surface sqlc utilisée par Service.
type starterQuerier interface {
	ListStarterPacks(ctx context.Context, arg db.ListStarterPacksParams) ([]db.ListStarterPacksRow, error)
	GetStarterPackByID(ctx context.Context, id string) (db.GetStarterPackByIDRow, error)
	ListStarterPackItems(ctx context.Context, starterPackID string) ([]db.ListStarterPackItemsRow, error)
	CreateStarterPack(ctx context.Context, arg db.CreateStarterPackParams) (db.StarterPack, error)
	InsertStarterPackItem(ctx context.Context, arg db.InsertStarterPackItemParams) error
	FollowPublications(ctx context.Context, arg db.FollowPublicationsParams) (int32, error)
}
