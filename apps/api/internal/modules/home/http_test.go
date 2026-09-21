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
	requirePool(t)
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

// TestHomeGlobalAnnouncement vérifie que l'annonce globale est servie par
// l'API Go : active → payload, inactive/malformée → null (pas de 500).
func TestHomeGlobalAnnouncement(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`); err != nil {
		t.Fatalf("nettoyage annonce: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `DELETE FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`)
	})
	r := newHTTPRouter()
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := get("/v1/home/announcement"); w.Code != http.StatusOK || w.Body.String() != "null\n" {
		t.Fatalf("annonce absente = %d %s, attendu 200 null", w.Code, w.Body.String())
	}
	active := `{"id":"ann_test","active":true,"message":"Maintenance ce soir","type":"warning","linkUrl":"/status","linkText":"Détails"}`
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "SystemConfig" (key, value, description, "updatedAt") VALUES ('GLOBAL_ANNOUNCEMENT', $1, 'Annonce globale', now())`,
		active); err != nil {
		t.Fatalf("insert annonce: %v", err)
	}
	w := get("/v1/home/announcement")
	if w.Code != http.StatusOK {
		t.Fatalf("annonce active = %d %s", w.Code, w.Body.String())
	}
	var announcement map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &announcement); err != nil {
		t.Fatalf("annonce json: %v (%s)", err, w.Body.String())
	}
	if announcement["id"] != "ann_test" || announcement["message"] != "Maintenance ce soir" ||
		announcement["type"] != "warning" || announcement["linkUrl"] != "/status" {
		t.Fatalf("annonce inattendue: %s", w.Body.String())
	}

	inactive := `{"id":"ann_test","active":false,"message":"Maintenance ce soir","type":"warning"}`
	if _, err := poolTest.Exec(ctx, `UPDATE "SystemConfig" SET value = $1 WHERE key = 'GLOBAL_ANNOUNCEMENT'`, inactive); err != nil {
		t.Fatalf("desactivation annonce: %v", err)
	}
	if w := get("/v1/home/announcement"); w.Code != http.StatusOK || w.Body.String() != "null\n" {
		t.Fatalf("annonce inactive = %d %s, attendu 200 null", w.Code, w.Body.String())
	}

	if _, err := poolTest.Exec(ctx, `UPDATE "SystemConfig" SET value = '{' WHERE key = 'GLOBAL_ANNOUNCEMENT'`); err != nil {
		t.Fatalf("annonce malformee: %v", err)
	}
	if w := get("/v1/home/announcement"); w.Code != http.StatusOK || w.Body.String() != "null\n" {
		t.Fatalf("annonce malformee = %d %s, attendu 200 null", w.Code, w.Body.String())
	}
}
