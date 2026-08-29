package home

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

var errBoom = errors.New("fault injecté")

type faultPool struct {
	pooler
	failExec     bool
	failQuery    bool
	failQueryRow bool
}

func (f *faultPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.failExec {
		return pgconn.CommandTag{}, errBoom
	}
	return f.pooler.Exec(ctx, sql, args...)
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

func faultRouter(fp *faultPool) *chi.Mux {
	r := chi.NewRouter()
	h := NewHandler(&Service{pool: fp, q: nil})
	h.RegisterPublic(r)
	return r
}

func seedHome(t *testing.T) {
	t.Helper()
	if _, err := testutil.SeedPosts(context.Background(), poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func TestFault_Handlers_PoolErrors(t *testing.T) {
	seedHome(t)

	cases := []struct {
		name     string
		fail     string
		method, path string
		body     string
		want     int
	}{
		{"config-500", "query", http.MethodGet, "/v1/home/config", "", http.StatusInternalServerError},
		{"trends-500", "query", http.MethodGet, "/v1/home/trends", "", http.StatusInternalServerError},
		{"promos-500", "query", http.MethodGet, "/v1/home/promos", "", http.StatusInternalServerError},
		{"suggested-500", "query", http.MethodGet, "/v1/home/suggested-creators", "", http.StatusInternalServerError},
		{"semantic-500", "query", http.MethodGet, "/v1/home/semantic-trends", "", http.StatusInternalServerError},
		{"subscribe-500", "exec", http.MethodPost, "/v1/home/subscribe", `{"email":"a@b.fr","publicationId":"pub_1"}`, http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fp := &faultPool{pooler: poolTest}
			switch tc.fail {
			case "exec":
				fp.failExec = true
			case "query":
				fp.failQuery = true
			case "queryrow":
				fp.failQueryRow = true
			}
			r := faultRouter(fp)
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.path == "/v1/home/suggested-creators" {
				ctx := context.WithValue(req.Context(), middleware.UserIDKey, "00000000-0000-0000-0000-000000000002")
				req = req.WithContext(ctx)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("%s %s → %d (%s), attendu %d", tc.method, tc.path, w.Code, w.Body.String(), tc.want)
			}
		})
	}
}

func TestSubscribe_BadRequests(t *testing.T) {
	r := faultRouter(&faultPool{pooler: poolTest})
	for _, tc := range []struct{ body string }{
		{`{bad`},                       // JSON invalide
		{`{"email":""}`},               // champs requis
		{`{"email":"pas-un-email","publicationId":"p"}`}, // email invalide
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/v1/home/subscribe", strings.NewReader(tc.body)))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("body %q → %d (%s), attendu 400", tc.body, w.Code, w.Body.String())
		}
	}
}

func TestStrOr(t *testing.T) {
	if got := strOr(pgtype.Text{String: "a", Valid: true}, pgtype.Text{String: "b", Valid: true}, "d"); got != "a" {
		t.Fatalf("primary → %q", got)
	}
	if got := strOr(pgtype.Text{}, pgtype.Text{String: "b", Valid: true}, "d"); got != "b" {
		t.Fatalf("fallback → %q", got)
	}
	if got := strOr(pgtype.Text{}, pgtype.Text{}, "d"); got != "d" {
		t.Fatalf("default → %q", got)
	}
}

func TestItoa(t *testing.T) {
	if itoa(42) != "42" {
		t.Fatalf("42 → %q", itoa(42))
	}
	if itoa(0) != "0" {
		t.Fatalf("0 → %q", itoa(0))
	}
}

// GetPromos avec une promo complète (ctaText/ctaUrl/imageUrl non nuls) couvre
// les branches « Valid » de l'assembly.
func TestGetPromos_FullFields(t *testing.T) {
	seedHome(t)
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "PartnerPromo" (id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive", "createdAt", "updatedAt")
		 VALUES ('promo_full', 'Titre', 'Desc', 'Voir', 'https://x.fr', 'https://img.fr', true, now(), now())`,
	); err != nil {
		t.Fatalf("seed promo: %v", err)
	}
	svc := &Service{pool: poolTest}
	promos, err := svc.GetPromos(context.Background(), 10)
	if err != nil {
		t.Fatalf("GetPromos: %v", err)
	}
	found := false
	for _, p := range promos {
		if p.ID == "promo_full" {
			found = true
			if p.CtaText == nil || p.CtaUrl == nil || p.ImageUrl == nil {
				t.Fatalf("champs complets attendus : %+v", p)
			}
		}
	}
	if !found {
		t.Fatalf("promo seedée absente de la réponse : %+v", promos)
	}
}

func TestFault_PlatformPickUserIDs(t *testing.T) {
	seedHome(t)
	ctx := context.Background()

	// Requête en erreur → liste vide (best-effort).
	svc := &Service{pool: &faultPool{pooler: poolTest, failQuery: true}}
	if got := svc.platformPickUserIDs(ctx); len(got) != 0 {
		t.Fatalf("erreur requête → %v, attendu vide", got)
	}
	// Pas de recommandations → vide.
	svc = &Service{pool: poolTest}
	if got := svc.platformPickUserIDs(ctx); len(got) != 0 {
		t.Fatalf("aucune recommandation → %v, attendu vide", got)
	}
}

func TestSuggestedCreators_NoAuth_ColdStart(t *testing.T) {
	seedHome(t)
	r := faultRouter(&faultPool{pooler: poolTest})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/v1/home/suggested-creators?limit=3", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("cold-start → %d (%s), attendu 200", w.Code, w.Body.String())
	}
}
