package creator

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func TestCreatorAPI_ReadRoutesRequireScopeRead(t *testing.T) {
	r := chi.NewRouter()
	h := NewHandler(nil, nil, "")
	h.RegisterAPIKey(r)

	readRoutes := []string{
		"/v1/creator/me",
		"/v1/creator/articles",
		"/v1/creator/articles/mon-slug",
		"/v1/creator/categories",
		"/v1/creator/search?q=test",
	}

	for _, path := range readRoutes {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		// Simule une clé API n'ayant que le scope analytics (pas read).
		ctx := context.WithValue(req.Context(), middleware.ScopesKey, []string{middleware.ScopeAnalytics})
		req = req.WithContext(ctx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("%s avec scope analytics: code = %d, attendu 403", path, w.Code)
		}
	}
}

func TestCreatorAPI_VisibilityValidation(t *testing.T) {
	valid := []string{"PUBLIC", "PAID_SUBSCRIBERS", "MEMBERS_ONLY", "TIER_SPECIFIC"}
	for _, v := range valid {
		if !isValidVisibility(v) {
			t.Errorf("isValidVisibility(%q) = false, attendu true", v)
		}
	}
	invalid := []string{"", "PRIVATE", "ADMIN", "public"}
	for _, v := range invalid {
		if isValidVisibility(v) {
			t.Errorf("isValidVisibility(%q) = true, attendu false", v)
		}
	}
}

func TestCreatorAPI_CreateInputValidation(t *testing.T) {
	h := NewHandler(nil, nil, "")

	cases := []struct {
		name string
		body string
	}{
		{"invalid json", `{`},
		{"invalid contentFormat", `{"title":"Hello","content":"world","contentFormat":"rtf"}`},
		{"invalid visibility", `{"title":"Hello","content":"world","visibility":"SECRET"}`},
		{"invalid scheduledAt", `{"title":"Hello","content":"world","scheduledAt":"not-a-date"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/v1/creator/articles", strings.NewReader(tc.body))
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, "u1")
			ctx = context.WithValue(ctx, middleware.PublisherIDKey, "p1")
			req = req.WithContext(ctx)

			w := httptest.NewRecorder()
			h.apiArticleCreate(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("%s: code = %d (%s), attendu 400", tc.name, w.Code, w.Body.String())
			}
		})
	}
}
