package users

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

var errBoom = errors.New("fault injecté")

// faultPool force des erreurs sur Exec/Query/QueryRow (requêtes brutes).
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

// faultRouter monte le routeur avec un service au pool en faute.
func faultRouter(fp *faultPool) http.Handler {
	r := chi.NewRouter()
	h := NewHandler(&Service{pool: fp})
	h.Register(r)
	h.RegisterPublic(r)
	return r
}

func authed(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func seedUsers(t *testing.T) string {
	t.Helper()
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	return fx.AuthorID
}

func TestFault_Handlers_PoolErrors(t *testing.T) {
	userID := seedUsers(t)

	cases := []struct {
		name     string
		fail     string // exec | query | queryrow
		method, path string
		body     string
		want     int
	}{
		{"me-500", "queryrow", http.MethodGet, "/v1/me", "", http.StatusInternalServerError},
		{"billing-500", "queryrow", http.MethodGet, "/v1/me/billing", "", http.StatusInternalServerError},
		{"dataExport-500", "queryrow", http.MethodGet, "/v1/me/data-export", "", http.StatusInternalServerError},
		{"mediaPublication-500", "queryrow", http.MethodGet, "/v1/me/media/pub_media_1", "", http.StatusInternalServerError},
		{"onboardingComplete-500", "exec", http.MethodPost, "/v1/me/onboarding-complete", `{"interests":["foot"]}`, http.StatusInternalServerError},
		{"mutedWords-400", "exec", http.MethodPost, "/v1/me/muted-words", `{"word":"spoiler"}`, http.StatusBadRequest},
		{"search-500", "query", http.MethodGet, "/v1/users/search?q=ali", "", http.StatusInternalServerError},
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
			w := authed(r, tc.method, tc.path, userID, tc.body)
			if w.Code != tc.want {
				t.Fatalf("%s %s → %d (%s), attendu %d", tc.method, tc.path, w.Code, w.Body.String(), tc.want)
			}
		})
	}
}

// ── Helpers purs ───────────────────────────────────────────────────────

func TestSplitComma(t *testing.T) {
	if got := splitComma("a,b,c"); len(got) != 3 || got[0] != "a" || got[2] != "c" {
		t.Fatalf("a,b,c → %v", got)
	}
	if got := splitComma(""); len(got) != 1 || got[0] != "" {
		t.Fatalf("vide → %v", got)
	}
	if got := splitComma("seul"); len(got) != 1 || got[0] != "seul" {
		t.Fatalf("seul → %v", got)
	}
}

func TestUuidString(t *testing.T) {
	u := pgtype.UUID{Bytes: [16]byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}, Valid: true}
	if got := uuidString(u); got != "00010203-0405-0607-0809-0a0b0c0d0e0f" {
		t.Fatalf("uuid → %q", got)
	}
	if got := uuidString(pgtype.UUID{}); got != "" {
		t.Fatalf("invalid → %q, attendu vide", got)
	}
}

func TestJsonFriendly(t *testing.T) {
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	if got := jsonFriendly(now); got != "2026-08-29T12:00:00Z" {
		t.Fatalf("time → %v", got)
	}
	if got := jsonFriendly([]byte("abc")); got != "abc" {
		t.Fatalf("bytes → %v", got)
	}
	u := pgtype.UUID{Bytes: [16]byte{1}, Valid: true}
	if got := jsonFriendly(u); got != "01000000-0000-0000-0000-000000000000" {
		t.Fatalf("uuid → %v", got)
	}
	s := "x"
	if got := jsonFriendly(&s); got != "x" {
		t.Fatalf("ptr → %v", got)
	}
	if got := jsonFriendly((*string)(nil)); got != nil {
		t.Fatalf("nil ptr → %v", got)
	}
	if got := jsonFriendly(42); got != 42 {
		t.Fatalf("int → %v", got)
	}
}

func TestFault_SyncUser(t *testing.T) {
	userID := seedUsers(t)

	// Claims JWT + user existant → 200 (mis à jour).
	r := faultRouter(&faultPool{pooler: poolTest})
	req := httptest.NewRequest(http.MethodPost, "/v1/me/sync", strings.NewReader(`{}`))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
	ctx = context.WithValue(ctx, middleware.ClaimsKey, map[string]any{"email": "alice@test.dev"})
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("sync existant → %d (%s), attendu 200", w.Code, w.Body.String())
	}

	// QueryRow en faute → 500.
	r = faultRouter(&faultPool{pooler: poolTest, failQueryRow: true})
	req = httptest.NewRequest(http.MethodPost, "/v1/me/sync", strings.NewReader(`{}`))
	ctx = context.WithValue(req.Context(), middleware.UserIDKey, userID)
	ctx = context.WithValue(ctx, middleware.ClaimsKey, map[string]any{"email": "alice@test.dev"})
	req = req.WithContext(ctx)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("sync pool faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func TestFallbackMockEmbedding_Deterministic(t *testing.T) {
	a := fallbackMockEmbedding("Bonjour", []string{"foot", "musique"})
	b := fallbackMockEmbedding("Bonjour", []string{"musique", "foot"}) // trié → même hash
	if len(a) == 0 {
		t.Fatal("vecteur vide")
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("déterministe attendu (ordre des intérêts) : [%d] %v vs %v", i, a[i], b[i])
		}
	}
	c := fallbackMockEmbedding("Autre", []string{"foot"})
	same := true
	for i := range a {
		if a[i] != c[i] {
			same = false
			break
		}
	}
	if same {
		t.Fatal("textes différents doivent donner des vecteurs différents")
	}
}
