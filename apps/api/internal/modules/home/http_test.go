package home

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/testutil"
)

// Tests HTTP des endpoints publics /v1/home (réutilise poolTest du
// fichier integration_test.go).

func newHTTPRouter() http.Handler {
	h := NewHandler(newTestService())
	r := chi.NewRouter()
	h.RegisterPublic(r)
	return r
}

func TestHomePublicEndpoints(t *testing.T) {
	if _, err := testutil.SeedPosts(context.Background(), poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newHTTPRouter()

	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := get("/v1/home/config"); w.Code != http.StatusOK {
		t.Fatalf("config = %d %s", w.Code, w.Body.String())
	}
	if w := get("/v1/home/trends?limit=5"); w.Code != http.StatusOK {
		t.Fatalf("trends = %d %s", w.Code, w.Body.String())
	}
	if w := get("/v1/home/promos"); w.Code != http.StatusOK {
		t.Fatalf("promos = %d %s", w.Code, w.Body.String())
	}

	// onboarding (auth optionnelle) : JSON exploitable.
	w := get("/v1/home/onboarding")
	if w.Code != http.StatusOK {
		t.Fatalf("onboarding = %d %s", w.Code, w.Body.String())
	}
	var data map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("onboarding json: %v (%s)", err, w.Body.String())
	}
}
