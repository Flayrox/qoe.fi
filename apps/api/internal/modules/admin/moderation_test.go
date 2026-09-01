package admin

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
)

// moderationFaultQ délègue au vrai *db.Queries sauf les méthodes listées.
type moderationFaultQ struct {
	*db.Queries
	err error
}

func (f *moderationFaultQ) GetModerationReport(ctx context.Context, id string) (db.ModerationReport, error) {
	return db.ModerationReport{}, f.err
}
func (f *moderationFaultQ) HidePostByModerator(ctx context.Context, id string) error {
	return f.err
}
func (f *moderationFaultQ) ListModerationReportsWithCount(ctx context.Context, arg db.ListModerationReportsWithCountParams) ([]db.ListModerationReportsWithCountRow, error) {
	return nil, f.err
}
func (f *moderationFaultQ) CountModerationReportsByStatus(ctx context.Context) ([]db.CountModerationReportsByStatusRow, error) {
	return nil, f.err
}

func TestModerationSuperadminGuard(t *testing.T) {
	seedAdmin(t, context.Background())
	svc := &Service{pool: poolTest, q: db.New(poolTest)}

	// UUID au bon format mais inexistant → rôle absent → errForbidden.
	const stranger = "00000000-0000-0000-0000-000000000000"
	if _, err := svc.ListReports(context.Background(), stranger, "", 10, 0); !errors.Is(err, errForbidden) {
		t.Fatalf("ListReports = %v, attendu errForbidden", err)
	}
	if _, err := svc.CountPendingReports(context.Background(), stranger); !errors.Is(err, errForbidden) {
		t.Fatalf("CountPendingReports = %v, attendu errForbidden", err)
	}
	if _, err := svc.ResolveReport(context.Background(), stranger, "rpt_1", "resolve", ""); !errors.Is(err, errForbidden) {
		t.Fatalf("ResolveReport = %v, attendu errForbidden", err)
	}
}

func TestResolveReportInvalidAction(t *testing.T) {
	seedAdmin(t, context.Background())
	svc := &Service{pool: poolTest, q: &moderationFaultQ{Queries: db.New(poolTest)}}

	_, err := svc.ResolveReport(context.Background(), adminAdminID, "rpt_1", "explode", "")
	if !errors.Is(err, errInvalidAction) {
		t.Fatalf("ResolveReport = %v, attendu errInvalidAction", err)
	}
}

func TestModeration500Branches(t *testing.T) {
	seedAdmin(t, context.Background())
	svc := &Service{pool: poolTest, q: &moderationFaultQ{Queries: db.New(poolTest), err: errors.New("boom")}}
	r := chi.NewRouter()
	NewHandler(svc).Register(r)

	cases := []struct{ method, path, body string }{
		{http.MethodGet, "/v1/admin/reports", ""},
		{http.MethodPatch, "/v1/admin/reports/rpt_1", `{"action":"resolve"}`},
	}
	for _, c := range cases {
		w := do(r, c.method, c.path, adminAdminID, c.body)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("%s %s = %d, attendu 500 (body %s)", c.method, c.path, w.Code, w.Body.String())
		}
	}
}
