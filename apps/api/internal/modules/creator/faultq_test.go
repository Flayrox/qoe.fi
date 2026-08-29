package creator

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

var errBoom = errors.New("fault injecté")

// faultQ délègue à *db.Queries sauf les méthodes en faute.
type faultQ struct {
	*db.Queries
	fail map[string]error
}

func (f *faultQ) val(name string) (error, bool) {
	e, ok := f.fail[name]
	return e, ok
}

func (f *faultQ) CheckCategorySlugExists(ctx context.Context, arg db.CheckCategorySlugExistsParams) (bool, error) {
	if e, ok := f.val("CheckCategorySlugExists"); ok {
		return false, e
	}
	return f.Queries.CheckCategorySlugExists(ctx, arg)
}
func (f *faultQ) CountFollowers(ctx context.Context, publicationid string) (int32, error) {
	if e, ok := f.val("CountFollowers"); ok {
		return 0, e
	}
	return f.Queries.CountFollowers(ctx, publicationid)
}
func (f *faultQ) CountFollowing(ctx context.Context, readerid pgtype.UUID) (int32, error) {
	if e, ok := f.val("CountFollowing"); ok {
		return 0, e
	}
	return f.Queries.CountFollowing(ctx, readerid)
}
func (f *faultQ) CreateCategory(ctx context.Context, arg db.CreateCategoryParams) (db.Category, error) {
	if e, ok := f.val("CreateCategory"); ok {
		return db.Category{}, e
	}
	return f.Queries.CreateCategory(ctx, arg)
}
func (f *faultQ) DeleteCategory(ctx context.Context, id string) error {
	if e, ok := f.val("DeleteCategory"); ok {
		return e
	}
	return f.Queries.DeleteCategory(ctx, id)
}
func (f *faultQ) DeleteFollow(ctx context.Context, arg db.DeleteFollowParams) error {
	if e, ok := f.val("DeleteFollow"); ok {
		return e
	}
	return f.Queries.DeleteFollow(ctx, arg)
}
func (f *faultQ) GetCategoryByID(ctx context.Context, id string) (db.Category, error) {
	if e, ok := f.val("GetCategoryByID"); ok {
		return db.Category{}, e
	}
	return f.Queries.GetCategoryByID(ctx, id)
}
func (f *faultQ) GetExistingFollow(ctx context.Context, arg db.GetExistingFollowParams) (int32, error) {
	if e, ok := f.val("GetExistingFollow"); ok {
		return 0, e
	}
	return f.Queries.GetExistingFollow(ctx, arg)
}
func (f *faultQ) GetMediaMemberContext(ctx context.Context, arg db.GetMediaMemberContextParams) (db.GetMediaMemberContextRow, error) {
	if e, ok := f.val("GetMediaMemberContext"); ok {
		return db.GetMediaMemberContextRow{}, e
	}
	return f.Queries.GetMediaMemberContext(ctx, arg)
}
func (f *faultQ) GetPublicationBySlugOrSubdomain(ctx context.Context, lower string) (db.GetPublicationBySlugOrSubdomainRow, error) {
	if e, ok := f.val("GetPublicationBySlugOrSubdomain"); ok {
		return db.GetPublicationBySlugOrSubdomainRow{}, e
	}
	return f.Queries.GetPublicationBySlugOrSubdomain(ctx, lower)
}
func (f *faultQ) GetPublicationOwner(ctx context.Context, id string) (string, error) {
	if e, ok := f.val("GetPublicationOwner"); ok {
		return "", e
	}
	return f.Queries.GetPublicationOwner(ctx, id)
}
func (f *faultQ) GetUserByIDFull(ctx context.Context, id string) (db.GetUserByIDFullRow, error) {
	if e, ok := f.val("GetUserByIDFull"); ok {
		return db.GetUserByIDFullRow{}, e
	}
	return f.Queries.GetUserByIDFull(ctx, id)
}
func (f *faultQ) GetUserPersonalPublication(ctx context.Context, id string) (pgtype.Text, error) {
	if e, ok := f.val("GetUserPersonalPublication"); ok {
		return pgtype.Text{}, e
	}
	return f.Queries.GetUserPersonalPublication(ctx, id)
}
func (f *faultQ) GetUserPronouns(ctx context.Context, id string) (pgtype.Text, error) {
	if e, ok := f.val("GetUserPronouns"); ok {
		return pgtype.Text{}, e
	}
	return f.Queries.GetUserPronouns(ctx, id)
}
func (f *faultQ) InsertFollow(ctx context.Context, arg db.InsertFollowParams) error {
	if e, ok := f.val("InsertFollow"); ok {
		return e
	}
	return f.Queries.InsertFollow(ctx, arg)
}
func (f *faultQ) ListCategoriesByPublication(ctx context.Context, publicationid string) ([]db.ListCategoriesByPublicationRow, error) {
	if e, ok := f.val("ListCategoriesByPublication"); ok {
		return nil, e
	}
	return f.Queries.ListCategoriesByPublication(ctx, publicationid)
}
func (f *faultQ) ListFollowersByPublication(ctx context.Context, arg db.ListFollowersByPublicationParams) ([]db.ListFollowersByPublicationRow, error) {
	if e, ok := f.val("ListFollowersByPublication"); ok {
		return nil, e
	}
	return f.Queries.ListFollowersByPublication(ctx, arg)
}
func (f *faultQ) ListFollowingByUser(ctx context.Context, arg db.ListFollowingByUserParams) ([]db.ListFollowingByUserRow, error) {
	if e, ok := f.val("ListFollowingByUser"); ok {
		return nil, e
	}
	return f.Queries.ListFollowingByUser(ctx, arg)
}
func (f *faultQ) UpdateCategory(ctx context.Context, arg db.UpdateCategoryParams) error {
	if e, ok := f.val("UpdateCategory"); ok {
		return e
	}
	return f.Queries.UpdateCategory(ctx, arg)
}
func (f *faultQ) GetFollowPrefs(ctx context.Context, userid pgtype.UUID) (db.GetFollowPrefsRow, error) {
	if e, ok := f.val("GetFollowPrefs"); ok {
		return db.GetFollowPrefsRow{}, e
	}
	return f.Queries.GetFollowPrefs(ctx, userid)
}
func (f *faultQ) ExistsUnreadFollowNotification(ctx context.Context, arg db.ExistsUnreadFollowNotificationParams) (int32, error) {
	if e, ok := f.val("ExistsUnreadFollowNotification"); ok {
		return 0, e
	}
	return f.Queries.ExistsUnreadFollowNotification(ctx, arg)
}
func (f *faultQ) InsertFollowNotification(ctx context.Context, arg db.InsertFollowNotificationParams) error {
	if e, ok := f.val("InsertFollowNotification"); ok {
		return e
	}
	return f.Queries.InsertFollowNotification(ctx, arg)
}
func (f *faultQ) DeleteFollowNotification(ctx context.Context, arg db.DeleteFollowNotificationParams) error {
	if e, ok := f.val("DeleteFollowNotification"); ok {
		return e
	}
	return f.Queries.DeleteFollowNotification(ctx, arg)
}

// faultPool force des erreurs sur Exec/Query/QueryRow (requêtes brutes).
type faultPool struct {
	*pgxpool.Pool
	failExec     bool
	failQuery    bool
	failQueryRow bool
}

func (f *faultPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.failExec {
		return pgconn.CommandTag{}, errBoom
	}
	return f.Pool.Exec(ctx, sql, args...)
}
func (f *faultPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if f.failQuery {
		return nil, errBoom
	}
	return f.Pool.Query(ctx, sql, args...)
}
func (f *faultPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.failQueryRow {
		return errorRow{err: errBoom}
	}
	return f.Pool.QueryRow(ctx, sql, args...)
}

type errorRow struct {
	err error
}

func (r errorRow) Scan(dest ...any) error { return r.err }

func newFaultHandler(qf map[string]error) (*Handler, *faultQ, *faultPool) {
	fq := &faultQ{Queries: db.New(poolTest), fail: qf}
	fp := &faultPool{Pool: poolTest}
	return &Handler{pool: fp, q: fq}, fq, fp
}
