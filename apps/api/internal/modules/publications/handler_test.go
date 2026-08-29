package publications

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func doRoute(h *Handler, method, path string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(method, path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHandlerByDomain(t *testing.T) {
	seedPublication(t)
	h := NewHandler(NewService(poolTest))

	w := doRoute(h, http.MethodGet, "/v1/publications/by-domain/tenant")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	if w.Body.String() == "" {
		t.Fatal("body vide")
	}
}

func TestHandlerByDomainBadRequest(t *testing.T) {
	h := NewHandler(NewService(poolTest))
	for _, path := range []string{
		"/v1/publications/by-domain/%20",
		"/v1/publications/by-domain/tenant/article/%20",
	} {
		w := doRoute(h, http.MethodGet, path)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s: code = %d, attendu 400", path, w.Code)
		}
	}
}

func TestHandlerByDomainNotFound(t *testing.T) {
	h := NewHandler(NewService(poolTest))
	w := doRoute(h, http.MethodGet, "/v1/publications/by-domain/introuvable")
	if w.Code != http.StatusNotFound {
		t.Fatalf("code = %d, attendu 404", w.Code)
	}
}

func TestHandlerArticle(t *testing.T) {
	seedPublication(t)
	h := NewHandler(NewService(poolTest))

	w := doRoute(h, http.MethodGet, "/v1/publications/by-domain/tenant/article/article-tenant")
	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	if w.Body.String() == "" {
		t.Fatal("body vide")
	}
}

func TestHandlerArticleNotFound(t *testing.T) {
	seedPublication(t)
	h := NewHandler(NewService(poolTest))
	w := doRoute(h, http.MethodGet, "/v1/publications/by-domain/tenant/article/introuvable")
	if w.Code != http.StatusNotFound {
		t.Fatalf("code = %d, attendu 404", w.Code)
	}
}

func TestHandlerInternalError(t *testing.T) {
	fp := &faultPool{err: errors.New("db down")}
	h := NewHandler(&Service{pool: fp})

	w := doRoute(h, http.MethodGet, "/v1/publications/by-domain/tenant")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d, attendu 500", w.Code)
	}
	w = doRoute(h, http.MethodGet, "/v1/publications/by-domain/tenant/article/x")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("article: code = %d, attendu 500", w.Code)
	}
}

// ─── faultPool : force des erreurs DB sur le pool ────────────────────

type faultPool struct {
	pooler
	err error
}

func (f *faultPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.pooler.Query(ctx, sql, args...)
}

func (f *faultPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.err != nil {
		return errRow{f.err}
	}
	return f.pooler.QueryRow(ctx, sql, args...)
}

type errRow struct{ err error }

func (e errRow) Scan(dest ...any) error { return e.err }

func TestServiceErrorBranches(t *testing.T) {
	seedPublication(t)
	ctx := context.Background()
	real := NewService(poolTest)

	// Chaque helper propage l'erreur DB.
	fp := &faultPool{pooler: poolTest, err: errors.New("boom")}
	svc := &Service{pool: fp}

	if _, err := svc.ByDomain(ctx, "tenant"); err == nil {
		t.Fatal("ByDomain attendu erreur (publicationByDomain)")
	}
	if _, err := svc.publicationByDomain(ctx, "tenant"); err == nil {
		t.Fatal("publicationByDomain attendu erreur")
	}
	if _, err := svc.navigation(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("navigation attendu erreur")
	}
	if _, err := svc.socialLinks(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("socialLinks attendu erreur")
	}
	if _, err := svc.categories(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("categories attendu erreur")
	}
	if _, err := svc.publishedArticles(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("publishedArticles attendu erreur")
	}
	if _, _, err := svc.articleBySlugOrID(ctx, "pub_tenant_test", "article-tenant", &PublicationUser{ID: "x"}); err == nil {
		t.Fatal("articleBySlugOrID attendu erreur")
	}
	if _, err := svc.articleDirect(ctx, "pub_tenant_test", "article-tenant"); err == nil {
		t.Fatal("articleDirect attendu erreur")
	}
	if _, err := svc.articleViaAttribution(ctx, "article-tenant", "user"); err == nil {
		t.Fatal("articleViaAttribution attendu erreur")
	}
	if _, err := svc.attributionCategorySlug(ctx, "article_tenant_1", "user"); err == nil {
		t.Fatal("attributionCategorySlug attendu erreur")
	}
	if _, err := svc.subscriberEntitlements(ctx, "pub_tenant_test", "u", "e"); err == nil {
		t.Fatal("subscriberEntitlements attendu erreur")
	}
	if _, err := svc.isBookmarked(ctx, "article_tenant_1", "u"); err == nil {
		t.Fatal("isBookmarked attendu erreur")
	}
	if _, err := svc.isFollowed(ctx, "pub_tenant_test", "u"); err == nil {
		t.Fatal("isFollowed attendu erreur")
	}

	// Le service nominal (pool réel) reste fonctionnel après le seed.
	if _, err := real.navigation(ctx, "pub_tenant_test"); err != nil {
		t.Fatalf("navigation nominale: %v", err)
	}
}

// badPool retourne des rows dont le Scan échoue systématiquement.
type badPool struct {
	pooler
}

func (b *badPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return badRows{}, nil
}

type badRows struct{}

func (badRows) Next() bool                                    { return true }
func (badRows) Scan(dest ...any) error                        { return errors.New("scan fail") }
func (badRows) Close()                                        {}
func (badRows) Err() error                                    { return nil }
func (badRows) CommandTag() pgconn.CommandTag                 { return pgconn.CommandTag{} }
func (badRows) FieldDescriptions() []pgconn.FieldDescription  { return nil }
func (badRows) Values() ([]any, error)                        { return nil, errors.New("scan fail") }
func (badRows) RawValues() [][]byte                           { return nil }
func (badRows) Conn() *pgx.Conn                               { return nil }

// TestServiceRowScanErrors force une erreur de scan dans les boucles de rows.
func TestServiceRowScanErrors(t *testing.T) {
	seedPublication(t)
	ctx := context.Background()

	// Rows dont le Scan échoue systématiquement → erreur remontée.
	bad := &badPool{pooler: poolTest}
	svc := &Service{pool: bad}

	if _, err := svc.navigation(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("navigation scan attendu erreur")
	}
	if _, err := svc.socialLinks(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("socialLinks scan attendu erreur")
	}
	if _, err := svc.categories(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("categories scan attendu erreur")
	}
	if _, err := svc.publishedArticles(ctx, "pub_tenant_test"); err == nil {
		t.Fatal("publishedArticles scan attendu erreur")
	}
}
