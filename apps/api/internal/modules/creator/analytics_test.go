package creator

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/umami"
)

// mockUmami répond aux endpoints /websites/{id}/stats et /metrics (type=url).
func mockUmamiServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/websites/site_1/stats":
			_, _ = w.Write([]byte(`{"pageviews":{"value":120},"visitors":{"value":30},"visits":{"value":35},"bounces":{"value":5},"totaltime":{"value":900}}`))
		case r.URL.Path == "/websites/site_1/metrics" && r.URL.Query().Get("type") == "url":
			_, _ = w.Write([]byte(`[{"x":"/article-1","y":42}]`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestAnalyticsStats_WithUmami(t *testing.T) {
	srv := mockUmamiServer(t)
	h := &Handler{umami: umami.NewClient(srv.URL, "key", "user", "pass"), defaultWeb: "site_1"}
	r := chi.NewRouter()
	h.RegisterAPIKey(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats?startAt=1000&endAt=2000", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UmamiWebsiteIDKey, "site_1"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("stats = %d (%s), attendu 200", w.Code, w.Body.String())
	}
	if !containsStr(w.Body.String(), "pageviews") {
		t.Fatalf("shape stats attendue : %s", w.Body.String())
	}
}

func TestAnalyticsStats_DefaultWebsiteID(t *testing.T) {
	srv := mockUmamiServer(t)
	h := &Handler{umami: umami.NewClient(srv.URL, "key", "user", "pass"), defaultWeb: "site_1"}
	r := chi.NewRouter()
	h.RegisterAPIKey(r)

	// Pas de website dans le contexte → defaultWeb utilisé.
	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("stats = %d (%s), attendu 200", w.Code, w.Body.String())
	}
}

func TestAnalyticsStats_NoWebsite_Zeros(t *testing.T) {
	h := &Handler{umami: umami.NewClient("http://unused", "k", "u", "p")}
	r := chi.NewRouter()
	h.RegisterAPIKey(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("stats = %d (%s), attendu 200", w.Code, w.Body.String())
	}
	// Sans websiteID → stats à zéro, sans appel réseau.
	if !containsStr(w.Body.String(), "\"pageviews\":0") {
		t.Fatalf("shape zéros attendue : %s", w.Body.String())
	}
}

// --- helpers locaux ---

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
