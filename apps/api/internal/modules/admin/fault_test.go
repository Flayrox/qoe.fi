package admin

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	db "github.com/qoefi/api/internal/database"
)

// adminFaultQ délègue au vrai *db.Queries sauf les méthodes listées.
type adminFaultQ struct {
	*db.Queries
	err error
}

func (f *adminFaultQ) AdminDashboardCounts(ctx context.Context) (db.AdminDashboardCountsRow, error) {
	return db.AdminDashboardCountsRow{}, f.err
}
func (f *adminFaultQ) GetAdminUser(ctx context.Context, id string) (db.GetAdminUserRow, error) {
	return db.GetAdminUserRow{}, f.err
}
func (f *adminFaultQ) ListAdminUsers(ctx context.Context) ([]db.ListAdminUsersRow, error) {
	return nil, f.err
}
func (f *adminFaultQ) ListAdminTrends(ctx context.Context) ([]db.Trend, error) {
	return nil, f.err
}
func (f *adminFaultQ) SetArticleEditorPick(ctx context.Context, arg db.SetArticleEditorPickParams) (db.SetArticleEditorPickRow, error) {
	return db.SetArticleEditorPickRow{}, f.err
}
func (f *adminFaultQ) ListSystemConfigs(ctx context.Context) ([]db.SystemConfig, error) {
	return nil, f.err
}
func (f *adminFaultQ) ListNotificationDeliveries(ctx context.Context) ([]db.ListNotificationDeliveriesRow, error) {
	return nil, f.err
}

// TestAdmin500Branches : chaque route renvoie 500 quand le service échoue.
func TestAdmin500Branches(t *testing.T) {
	seedAdmin(t, context.Background())
	svc := &Service{pool: poolTest, q: &adminFaultQ{Queries: db.New(poolTest), err: errors.New("boom")}}
	h := NewHandler(svc)
	r := newRouterFor(svc)
	_ = h

	cases := []struct{ method, path, body string }{
		{http.MethodGet, "/v1/admin/dashboard", ""},
		{http.MethodGet, "/v1/admin/users", ""},
		{http.MethodGet, "/v1/admin/users/" + adminCreator, ""},
		{http.MethodGet, "/v1/admin/widgets", ""},
		{http.MethodPost, "/v1/admin/widgets/featured", `{"articleId":"art_adm_01","featured":true}`},
		{http.MethodGet, "/v1/admin/config", ""},
		{http.MethodGet, "/v1/admin/deliveries", ""},
	}
	for _, c := range cases {
		w := do(r, c.method, c.path, adminAdminID, c.body)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("%s %s = %d, attendu 500 (body %s)", c.method, c.path, w.Code, w.Body.String())
		}
	}
}

// newRouterFor monte le routeur admin sur un service donné.
func newRouterFor(svc *Service) http.Handler {
	r := chi.NewRouter()
	NewHandler(svc).Register(r)
	return r
}
