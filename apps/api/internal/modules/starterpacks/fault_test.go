package starterpacks

import (
	"context"
	"errors"
	"testing"

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

type faultPool struct {
	pooler
	err error
}

func (f *faultPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.err != nil {
		return errRow{f.err}
	}
	return f.pooler.QueryRow(ctx, sql, args...)
}

func (f *faultPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.err != nil {
		return pgconn.CommandTag{}, f.err
	}
	return f.pooler.Exec(ctx, sql, args...)
}

type errRow struct{ err error }

func (e errRow) Scan(dest ...any) error { return e.err }

type faultQ struct {
	err error
}

func (f faultQ) ListStarterPacks(ctx context.Context, arg db.ListStarterPacksParams) ([]db.ListStarterPacksRow, error) {
	return nil, f.err
}
func (f faultQ) GetStarterPackByID(ctx context.Context, id string) (db.GetStarterPackByIDRow, error) {
	return db.GetStarterPackByIDRow{}, f.err
}
func (f faultQ) ListStarterPackItems(ctx context.Context, starterPackID string) ([]db.ListStarterPackItemsRow, error) {
	return nil, f.err
}
func (f faultQ) CreateStarterPack(ctx context.Context, arg db.CreateStarterPackParams) (db.StarterPack, error) {
	return db.StarterPack{}, f.err
}
func (f faultQ) InsertStarterPackItem(ctx context.Context, arg db.InsertStarterPackItemParams) error {
	return f.err
}
func (f faultQ) FollowPublications(ctx context.Context, arg db.FollowPublicationsParams) (int32, error) {
	return 0, f.err
}

func TestServiceErrorBranches(t *testing.T) {
	seedStarterPacks(t)
	ctx := context.Background()
	boom := errors.New("boom")

	// q en faute → erreurs propagées.
	svcQ := &Service{pool: poolTest, q: faultQ{err: boom}}
	if _, err := svcQ.List(ctx, 20, 0); err == nil {
		t.Fatal("List attendu erreur")
	}
	if _, err := svcQ.Get(ctx, "x"); err == nil {
		t.Fatal("Get attendu erreur")
	}
	if _, err := svcQ.Create(ctx, "u", "T", nil, nil, nil); err == nil {
		t.Fatal("Create attendu erreur")
	}
	if _, err := svcQ.FollowAll(ctx, "x", "u"); err == nil {
		t.Fatal("FollowAll attendu erreur")
	}

	// pool en faute → resolvePersonalPublication/FollowAll échouent.
	svcP := &Service{pool: &faultPool{pooler: poolTest, err: boom}, q: db.New(poolTest)}
	if _, err := svcP.Create(ctx, "u", "T", nil, nil, nil); err == nil {
		t.Fatal("Create (pool en faute) attendu erreur")
	}
	if _, err := svcP.FollowAll(ctx, "x", "u"); err == nil {
		t.Fatal("FollowAll (pool en faute) attendu erreur")
	}
}
