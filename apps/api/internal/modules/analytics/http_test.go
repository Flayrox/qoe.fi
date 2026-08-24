package analytics

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Tests HTTP du handler analytics : routage, paramètres requis, RBAC
// publication (owner vs étranger) et contrats JSON de base.

func newAnalyticsRouter() http.Handler {
	h := NewHandler(newTestService())
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func get(t *testing.T, r http.Handler, path, userID string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHTTP_RequiresPublicationID(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	_ = fx
	r := newAnalyticsRouter()

	for _, path := range []string{
		"/v1/analytics/financial",
		"/v1/analytics/top-content",
		"/v1/analytics/audience",
	} {
		w := get(t, r, path, "00000000-0000-0000-0000-000000000001")
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s sans publicationId = %d, attendu 400", path, w.Code)
		}
	}
}

func TestHTTP_Financial_ForbiddenForOutsider(t *testing.T) {
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	// Un utilisateur hors média (pas membre de la publication).
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000300', 'out@test.dev', 'outsider', 'O', 'user', now(), now())`); err != nil {
		t.Fatalf("seed outsider: %v", err)
	}

	r := newAnalyticsRouter()
	w := get(t, r, "/v1/analytics/financial?publicationId="+mfx.PublicationID,
		"00000000-0000-0000-0000-000000000300")
	if w.Code != http.StatusForbidden {
		t.Fatalf("outsider = %d %s, attendu 403", w.Code, w.Body.String())
	}
}

func TestHTTP_TopContent_OwnerAllowed(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAnalyticsRouter()

	var pubID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "publicationId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&pubID); err != nil {
		t.Fatalf("publication auteur: %v", err)
	}

	w := get(t, r, "/v1/analytics/top-content?publicationId="+pubID+"&since=30d", fx.AuthorID)
	if w.Code != http.StatusOK {
		t.Fatalf("owner = %d %s, attendu 200", w.Code, w.Body.String())
	}
}

func TestHTTP_DashboardAndCreatorShape(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAnalyticsRouter()

	var pubID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "publicationId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&pubID); err != nil {
		t.Fatalf("publication auteur: %v", err)
	}

	w := get(t, r, "/v1/analytics/dashboard?publicationId="+pubID+"&since=7d", fx.AuthorID)
	if w.Code != http.StatusOK {
		t.Fatalf("dashboard owner = %d %s, attendu 200", w.Code, w.Body.String())
	}

	w = get(t, r, "/v1/analytics/creator?publicationId="+pubID, fx.AuthorID)
	if w.Code != http.StatusOK {
		t.Fatalf("creator owner = %d %s, attendu 200", w.Code, w.Body.String())
	}
}
