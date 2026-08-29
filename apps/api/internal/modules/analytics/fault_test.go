package analytics

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/middleware"
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

func (f *faultQ) GetUserPersonalPublication(ctx context.Context, id string) (pgtype.Text, error) {
	if e, ok := f.val("GetUserPersonalPublication"); ok {
		return pgtype.Text{}, e
	}
	return f.Queries.GetUserPersonalPublication(ctx, id)
}
func (f *faultQ) GetMediaRoleForUser(ctx context.Context, arg db.GetMediaRoleForUserParams) (string, error) {
	if e, ok := f.val("GetMediaRoleForUser"); ok {
		return "", e
	}
	return f.Queries.GetMediaRoleForUser(ctx, arg)
}
func (f *faultQ) GetPremiumActiveSubscribers(ctx context.Context, publicationid string) ([]db.GetPremiumActiveSubscribersRow, error) {
	if e, ok := f.val("GetPremiumActiveSubscribers"); ok {
		return nil, e
	}
	return f.Queries.GetPremiumActiveSubscribers(ctx, publicationid)
}
func (f *faultQ) GetFreeSubscriberCount(ctx context.Context, publicationid string) (int32, error) {
	if e, ok := f.val("GetFreeSubscriberCount"); ok {
		return 0, e
	}
	return f.Queries.GetFreeSubscriberCount(ctx, publicationid)
}
func (f *faultQ) GetAudienceSummary(ctx context.Context, publicationid string) (db.GetAudienceSummaryRow, error) {
	if e, ok := f.val("GetAudienceSummary"); ok {
		return db.GetAudienceSummaryRow{}, e
	}
	return f.Queries.GetAudienceSummary(ctx, publicationid)
}
func (f *faultQ) GetRecentArticlesForAnalytics(ctx context.Context, arg db.GetRecentArticlesForAnalyticsParams) ([]db.GetRecentArticlesForAnalyticsRow, error) {
	if e, ok := f.val("GetRecentArticlesForAnalytics"); ok {
		return nil, e
	}
	return f.Queries.GetRecentArticlesForAnalytics(ctx, arg)
}
func (f *faultQ) GetRecentThoughtsForAnalytics(ctx context.Context, arg db.GetRecentThoughtsForAnalyticsParams) ([]db.GetRecentThoughtsForAnalyticsRow, error) {
	if e, ok := f.val("GetRecentThoughtsForAnalytics"); ok {
		return nil, e
	}
	return f.Queries.GetRecentThoughtsForAnalytics(ctx, arg)
}
func (f *faultQ) GetPublicationUmamiWebsiteId(ctx context.Context, id string) (pgtype.Text, error) {
	if e, ok := f.val("GetPublicationUmamiWebsiteId"); ok {
		return pgtype.Text{}, e
	}
	return f.Queries.GetPublicationUmamiWebsiteId(ctx, id)
}
func (f *faultQ) ListSubscribers(ctx context.Context, publicationid string) ([]db.ListSubscribersRow, error) {
	if e, ok := f.val("ListSubscribers"); ok {
		return nil, e
	}
	return f.Queries.ListSubscribers(ctx, publicationid)
}

// faultPool force des erreurs sur Exec/Query/QueryRow.
type faultPool struct {
	pooler
	failQuery    bool
	failQueryRow bool
}

func (f *faultPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if f.failQuery {
		return nil, errBoom
	}
	return f.pooler.Query(ctx, sql, args...)
}

func (f *faultPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.failQueryRow {
		return errorRow{err: errBoom}
	}
	return f.pooler.QueryRow(ctx, sql, args...)
}

type errorRow struct {
	err error
}

func (r errorRow) Scan(dest ...any) error { return r.err }

const analyticsOwner = "00000000-0000-0000-0000-0000000000cc"
const analyticsPub = "pub_analytics_001"

// TestFinancial_Success : MRR/ARR/volume + conversion avec 1 premium (500cts/mois,
// LTV 1500) + 2 free.
func TestFinancial_Success(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)
	// Premium : Tier (500cts/mois) + abonné lié (LTV 1500).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Tier" (id, name, "monthlyPriceCents", "updatedAt", "publicationId")
		 VALUES ('tier_prem', 'Premium', 500, now(), $1)`, analyticsPub); err != nil {
		t.Fatalf("seed tier: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "isPremium", "ltvCents", "receiveArticles", "createdAt", "updatedAt", "tierId")
		 VALUES (gen_random_uuid()::text, 'prem@test.dev', $1, true, true, 1500, true, now(), now(), 'tier_prem')`,
		analyticsPub); err != nil {
		t.Fatalf("seed premium: %v", err)
	}

	svc := newTestService()
	fm, err := svc.Financial(ctx, analyticsOwner, analyticsPub)
	if err != nil {
		t.Fatalf("Financial: %v", err)
	}
	if fm.MRRCents != 500 || fm.ARRCents != 6000 || fm.GrossVolumeCents != 1500 {
		t.Fatalf("mrr=%d arr=%d gross=%d, attendu 500/6000/1500",
			fm.MRRCents, fm.ARRCents, fm.GrossVolumeCents)
	}
	// 1 premium + 2 free (seedProductMetrics) → total 3 → conversion 33,33%.
	if fm.ActiveSubscribersCount != 1 || fm.FreeSubscribersCount != 2 {
		t.Fatalf("active=%d free=%d, attendu 1/2",
			fm.ActiveSubscribersCount, fm.FreeSubscribersCount)
	}
	if fm.ConversionRatePercent != 33.33 {
		t.Fatalf("conversion = %v, attendu 33.33", fm.ConversionRatePercent)
	}

	// Étranger → errForbidden.
	if _, err := svc.Financial(ctx, "00000000-0000-0000-0000-000000000099", analyticsPub); !errors.Is(err, errForbidden) {
		t.Fatalf("Financial(étranger) = %v, attendu errForbidden", err)
	}
}

func TestFault_Financial_QueryErrors(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	for _, m := range []string{"GetPremiumActiveSubscribers", "GetFreeSubscriberCount"} {
		svc := &Service{pool: poolTest, q: &faultQ{Queries: db.New(poolTest), fail: map[string]error{m: errBoom}}}
		if _, err := svc.Financial(ctx, analyticsOwner, analyticsPub); err == nil {
			t.Errorf("Financial %s: err = nil", m)
		}
	}

	// canAccess en erreur → errForbidden.
	svc := &Service{pool: poolTest, q: &faultQ{Queries: db.New(poolTest), fail: map[string]error{"GetUserPersonalPublication": errBoom}}}
	if _, err := svc.Financial(ctx, analyticsOwner, analyticsPub); !errors.Is(err, errForbidden) {
		t.Fatalf("canAccess erreur = %v, attendu errForbidden", err)
	}
}

func TestFault_TopContent_QueryErrors(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	for _, m := range []string{"GetRecentArticlesForAnalytics", "GetRecentThoughtsForAnalytics"} {
		svc := &Service{pool: poolTest, q: &faultQ{Queries: db.New(poolTest), fail: map[string]error{m: errBoom}}}
		if _, err := svc.TopContent(ctx, analyticsOwner, analyticsPub, 5); err == nil {
			t.Errorf("TopContent %s: err = nil", m)
		}
	}
}

// umami : pool en faute → ReturningVisitors/VisitsByHour renvoient l'erreur
// (le handler répond 500).
func TestFault_Umami_PoolError(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	svc := &Service{
		pool:  poolTest,
		q:     db.New(poolTest),
		umami: &faultPool{pooler: poolTest, failQueryRow: true},
	}
	if _, err := svc.ReturningVisitors(ctx, "site-1", 1000, 2000); err == nil {
		t.Error("ReturningVisitors pool faute: err = nil")
	}
	if _, err := svc.VisitsByHour(ctx, "site-1", 1000, 2000); err == nil {
		t.Error("VisitsByHour pool faute: err = nil")
	}
}

func TestHTTP_Umami_Returning_PoolError(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)
	// La publication doit avoir un umamiWebsiteId pour atteindre le pool.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Publication" SET "umamiWebsiteId" = 'site-umami-test' WHERE id = $1`, analyticsPub); err != nil {
		t.Fatalf("set umamiWebsiteId: %v", err)
	}

	svc := &Service{
		pool:  poolTest,
		q:     db.New(poolTest),
		umami: &faultPool{pooler: poolTest, failQueryRow: true},
	}
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/umami/returning?publicationId="+analyticsPub, nil)
	req = req.WithContext(contextWithUser(req, analyticsOwner))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("umami/returning pool faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func contextWithUser(r *http.Request, userID string) context.Context {
	return context.WithValue(r.Context(), middleware.UserIDKey, userID)
}

// financial / top-content : erreur queryer (hors forbidden) → 500.
func TestFault_Handlers_FinancialTopContent(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{
		"GetPremiumActiveSubscribers": errBoom,
	}}
	r := chi.NewRouter()
	h := NewHandler(&Service{pool: poolTest, q: fq})
	h.Register(r)

	w := get(t, r, "/v1/analytics/financial?publicationId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("financial q faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}

	fq2 := &faultQ{Queries: db.New(poolTest), fail: map[string]error{
		"GetRecentArticlesForAnalytics": errBoom,
	}}
	r2 := chi.NewRouter()
	h2 := NewHandler(&Service{pool: poolTest, q: fq2})
	h2.Register(r2)
	w2 := get(t, r2, "/v1/analytics/top-content?publicationId="+analyticsPub, analyticsOwner)
	if w2.Code != http.StatusInternalServerError {
		t.Fatalf("top-content q faute → %d (%s), attendu 500", w2.Code, w2.Body.String())
	}
}

// Toutes les routes protégées : un utilisateur sans accès → 403 (branche
// Forbidden de chaque handler).
func TestHTTP_AllRoutes_Outsider_Forbidden(t *testing.T) {
	seedProductMetrics(t, context.Background())

	r := newAnalyticsRouter()
	outsider := "00000000-0000-0000-0000-000000000099"
	for _, path := range []string{
		"/v1/analytics/financial?publicationId=" + analyticsPub,
		"/v1/analytics/top-content?publicationId=" + analyticsPub,
		"/v1/analytics/audience?publicationId=" + analyticsPub,
		"/v1/analytics/audience/subscribers?publicationId=" + analyticsPub,
		"/v1/analytics/creator?publicationId=" + analyticsPub,
		"/v1/analytics/provenance?publicationId=" + analyticsPub,
		"/v1/analytics/audience/insights?publicationId=" + analyticsPub,
		"/v1/analytics/product-metrics?publicationId=" + analyticsPub,
		"/v1/analytics/dashboard?publicationId=" + analyticsPub,
	} {
		w := get(t, r, path, outsider)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s outsider → %d (%s), attendu 403", path, w.Code, w.Body.String())
		}
	}
}

// umamiHours : pool en faute → 500 via le handler (comme umamiReturning).
func TestHTTP_Umami_Hours_PoolError(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Publication" SET "umamiWebsiteId" = 'site-umami-test' WHERE id = $1`, analyticsPub); err != nil {
		t.Fatalf("set umamiWebsiteId: %v", err)
	}

	r := chi.NewRouter()
	h := NewHandler(&Service{pool: poolTest, q: db.New(poolTest),
		umami: &faultPool{pooler: poolTest, failQueryRow: true}})
	h.Register(r)

	w := get(t, r, "/v1/analytics/umami/hours?publicationId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("umami/hours pool faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

// productMetrics handler (0%) : owner → 200, étranger → 403.
// Handlers restants : branches 500 via pool en faute (lectures DB directes).
func TestFault_Handlers_InternalErrors(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	fq := &faultQ{Queries: db.New(poolTest), fail: map[string]error{
		"GetAudienceSummary": errBoom, "ListSubscribers": errBoom,
		"GetRecentArticlesForAnalytics": errBoom, "GetRecentThoughtsForAnalytics": errBoom,
	}}
	r := chi.NewRouter()
	h := NewHandler(&Service{pool: &faultPool{pooler: poolTest, failQuery: true}, q: fq})
	h.Register(r)

	for _, tc := range []struct{ path, user string }{
		{"/v1/analytics/audience?publicationId=" + analyticsPub, analyticsOwner},
		{"/v1/analytics/audience/subscribers?publicationId=" + analyticsPub, analyticsOwner},
		{"/v1/analytics/reading-sessions?articleId=art_an_01", analyticsOwner},
		{"/v1/analytics/creator?publicationId=" + analyticsPub, analyticsOwner},
		{"/v1/analytics/provenance?publicationId=" + analyticsPub, analyticsOwner},
		{"/v1/analytics/audience/insights?publicationId=" + analyticsPub, analyticsOwner},
	} {
		w := get(t, r, tc.path, tc.user)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("%s → %d (%s), attendu 500", tc.path, w.Code, w.Body.String())
		}
	}
}

func TestHTTP_ProductMetrics(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	r := chi.NewRouter()
	h := NewHandler(newTestService())
	h.Register(r)

	w := get(t, r, "/v1/analytics/product-metrics?publicationId="+analyticsPub, analyticsOwner)
	if w.Code != http.StatusOK {
		t.Fatalf("product-metrics owner → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	w = get(t, r, "/v1/analytics/product-metrics?publicationId="+analyticsPub, "00000000-0000-0000-0000-000000000099")
	if w.Code != http.StatusForbidden {
		t.Fatalf("product-metrics étranger → %d (%s), attendu 403", w.Code, w.Body.String())
	}
}

// Faults sur le pool du service (lectures ReadingSession / provenance / insights).
func TestFault_Service_PoolErrors(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)

	fp := &faultPool{pooler: poolTest, failQuery: true}
	svc := &Service{pool: fp, q: db.New(poolTest)}

	since := time.Now().Add(-30 * 24 * time.Hour)
	if _, err := svc.GetArticleReadingStats(ctx, analyticsOwner, "art_an_01", &since); err == nil {
		t.Error("GetArticleReadingStats pool: err = nil")
	}
	if _, err := svc.GetCreatorReadingStats(ctx, analyticsOwner, analyticsPub, &since); err == nil {
		t.Error("GetCreatorReadingStats pool: err = nil")
	}
	if _, err := svc.GetProvenance(ctx, analyticsOwner, analyticsPub, &since); err == nil {
		t.Error("GetProvenance pool: err = nil")
	}
	if _, err := svc.GetAudienceInsights(ctx, analyticsOwner, analyticsPub); err == nil {
		t.Error("GetAudienceInsights pool: err = nil")
	}
}
