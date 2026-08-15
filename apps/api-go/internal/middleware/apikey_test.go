package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHasScope(t *testing.T) {
	cases := []struct {
		scopes   []string
		required string
		want     bool
	}{
		{[]string{"READ", "WRITE"}, "READ", true},
		{[]string{"READ", "WRITE"}, "ANALYTICS", false},
		{nil, "READ", false},
		{AllScopes, "ANALYTICS", true},
	}
	for _, c := range cases {
		if got := HasScope(c.scopes, c.required); got != c.want {
			t.Errorf("HasScope(%v, %q) = %v, want %v", c.scopes, c.required, got, c.want)
		}
	}
}

func TestRequireAPIScope(t *testing.T) {
	ok := func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}

	t.Run("clé avec le scope requis → 200", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), ScopesKey, []string{ScopeRead, ScopeWrite})
		req := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
		rec := httptest.NewRecorder()
		RequireAPIScope(ScopeRead)(http.HandlerFunc(ok)).ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("code = %d, want 200", rec.Code)
		}
	})

	t.Run("clé sans le scope requis → 403", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), ScopesKey, []string{ScopeWrite})
		req := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
		rec := httptest.NewRecorder()
		RequireAPIScope(ScopeRead)(http.HandlerFunc(ok)).ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("code = %d, want 403", rec.Code)
		}
	})

	t.Run("JWT (pas de scopes en contexte) → passe (RBAC publication)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		RequireAPIScope(ScopeRead)(http.HandlerFunc(ok)).ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("code = %d, want 200", rec.Code)
		}
	})
}
