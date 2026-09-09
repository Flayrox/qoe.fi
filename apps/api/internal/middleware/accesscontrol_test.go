package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/qoefi/api/internal/apiaccess"
)

func TestAccessControl_DefaultOpen(t *testing.T) {
	ctx := context.Background()
	cleanupAccessControlConfig(t, ctx)
	defer cleanupAccessControlConfig(t, ctx)

	h := AccessControl(apiKeyPool)(okHandler())

	for _, path := range []string{"/v1/feed/trending", "/v1/users/me", "/healthz", "/v1/webhooks/stripe"} {
		w := accessControlReq(h, path)
		if w.Code != http.StatusOK {
			t.Fatalf("%s = %d, attendu 200 (défaut : API ouverte)", path, w.Code)
		}
	}
}

func TestAccessControl_KillSwitch(t *testing.T) {
	ctx := context.Background()
	cleanupAccessControlConfig(t, ctx)
	defer cleanupAccessControlConfig(t, ctx)
	// Cache court : les changements de config sont immédiats en test.
	setAccessControlTTL(t, 0)

	upsertAccessControlConfig(t, ctx, apiaccess.AccessDisabledKey, "true")
	h := AccessControl(apiKeyPool)(okHandler())

	// Toute l'API refuse les requêtes…
	if w := accessControlReq(h, "/v1/feed/trending"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("kill switch /v1/feed/trending = %d, attendu 503", w.Code)
	}
	if w := accessControlReq(h, "/v1/webhooks"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("kill switch /v1/webhooks = %d, attendu 503", w.Code)
	}
	// …sauf la console admin, l'IdP OAuth, les webhooks entrants infra.
	for _, path := range []string{"/v1/admin/dashboard", "/v1/oauth/userinfo", "/v1/webhooks/stripe", "/healthz"} {
		if w := accessControlReq(h, path); w.Code != http.StatusOK {
			t.Fatalf("%s = %d, attendu 200 (toujours joignable)", path, w.Code)
		}
	}
}

func TestAccessControl_DisabledEndpoints(t *testing.T) {
	ctx := context.Background()
	cleanupAccessControlConfig(t, ctx)
	defer cleanupAccessControlConfig(t, ctx)
	setAccessControlTTL(t, 0)

	upsertAccessControlConfig(t, ctx, apiaccess.AccessDisabledKey, "false")
	upsertAccessControlConfig(t, ctx, apiaccess.DisabledEndpointsKey, `["/v1/articles", "/v1/webhooks"]`)
	h := AccessControl(apiKeyPool)(okHandler())

	if w := accessControlReq(h, "/v1/articles/abc"); w.Code != http.StatusNotFound {
		t.Fatalf("endpoint désactivé /v1/articles/abc = %d, attendu 404", w.Code)
	}
	if w := accessControlReq(h, "/v1/articles"); w.Code != http.StatusNotFound {
		t.Fatalf("endpoint désactivé /v1/articles = %d, attendu 404", w.Code)
	}
	if w := accessControlReq(h, "/v1/webhooks/123/test"); w.Code != http.StatusNotFound {
		t.Fatalf("endpoint désactivé /v1/webhooks/123/test = %d, attendu 404", w.Code)
	}
	// Les autres endpoints restent joignables.
	if w := accessControlReq(h, "/v1/feed/trending"); w.Code != http.StatusOK {
		t.Fatalf("/v1/feed/trending = %d, attendu 200", w.Code)
	}
	// La console admin n'est jamais coupée par les endpoints désactivés.
	if w := accessControlReq(h, "/v1/admin/dashboard"); w.Code != http.StatusOK {
		t.Fatalf("/v1/admin/dashboard = %d, attendu 200", w.Code)
	}
}

func TestEndpointDisabled(t *testing.T) {
	prefixes := []string{"/v1/articles", "/v1/webhooks"}
	cases := []struct {
		path string
		want bool
	}{
		{"/v1/articles", true},
		{"/v1/articles/xyz", true},
		{"/v1/articlesXYZ", false},
		{"/v1/feed/trending", false},
		{"/v1/webhooks/1/deliveries", true},
	}
	for _, c := range cases {
		if got := apiaccess.EndpointDisabled(c.path, prefixes); got != c.want {
			t.Errorf("EndpointDisabled(%q) = %v, attendu %v", c.path, got, c.want)
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func accessControlReq(h http.Handler, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func setAccessControlTTL(t *testing.T, ttl time.Duration) {
	t.Helper()
	old := accessControlTTL
	accessControlTTL = ttl
	t.Cleanup(func() { accessControlTTL = old })
}

func cleanupAccessControlConfig(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := apiKeyPool.Exec(ctx,
		`DELETE FROM "SystemConfig" WHERE key = ANY($1::text[])`,
		[]string{apiaccess.AccessDisabledKey, apiaccess.DisabledEndpointsKey},
	); err != nil {
		t.Fatalf("cleanup config: %v", err)
	}
}

func upsertAccessControlConfig(t *testing.T, ctx context.Context, key, value string) {
	t.Helper()
	if _, err := apiKeyPool.Exec(ctx,
		`INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
		 VALUES ($1, $2, 'test access control', now())
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
		key, value,
	); err != nil {
		t.Fatalf("upsert %s: %v", key, err)
	}
}
