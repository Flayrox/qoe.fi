package settings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Cycle de vie des clés API créateur : génération (accès approuvé
// requis), scopes optionnels, listing sans fuite de hash, révocation.

func newKeysRouter() http.Handler {
	h := NewHandler(NewService(poolTest))
	r := chi.NewRouter()
	h.RegisterProtected(r)
	return r
}

func doKeys(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestApiKeyLifecycle(t *testing.T) {
	fx, err := testutil.SeedOAuth(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	r := newKeysRouter()

	// ── Génération refusée sans accès API approuvé.
	w := doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.ViewerID,
		`{"name":"Pirate"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-approuvé = %d %s, attendu 403", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "approuvée") {
		t.Fatalf("message d'accès manquant : %s", w.Body.String())
	}

	// ── Génération nominale (créateur approuvé) : clé en clair une seule fois.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.OwnerID,
		`{"name":"Intégration","scopes":["READ"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}
	var gen struct {
		APIKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &gen); err != nil || !strings.HasPrefix(gen.APIKey, "qoe_live_") {
		t.Fatalf("clé absente ou malformée : %s (%v)", w.Body.String(), err)
	}

	// Scope inconnu filtré ; tous invalides → 403 avec message dédié.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.OwnerID,
		`{"name":"Bad","scopes":["SUPERUSER"]}`)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "scope") {
		t.Fatalf("scopes invalides = %d %s, attendu 403 scope", w.Code, w.Body.String())
	}

	// ── Listing : métadonnées visibles, hash ET clé en clair absents.
	w = doKeys(r, http.MethodGet, "/v1/settings/api-keys", fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
	blob := w.Body.String()
	if strings.Contains(blob, "keyHash") || strings.Contains(blob, gen.APIKey) {
		t.Fatal("fuite de hash/clé dans le listing")
	}
	var listed struct {
		Keys []struct {
			Name   string `json:"name"`
			Scopes []any  `json:"scopes"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil || len(listed.Keys) == 0 {
		t.Fatalf("liste vide ou invalide : %s (%v)", blob, err)
	}

	// ── Révocation : la clé ne doit plus authentifier.
	rows, err := poolTest.Query(context.Background(),
		`SELECT id FROM "ApiKey" WHERE "userId" = $1`, fx.OwnerID)
	if err != nil {
		t.Fatalf("select keys: %v", err)
	}
	defer rows.Close()
	var keyID string
	for rows.Next() {
		if err := rows.Scan(&keyID); err != nil {
			t.Fatalf("scan: %v", err)
		}
		break
	}
	w = doKeys(r, http.MethodDelete, "/v1/settings/api-keys/"+keyID, fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("revoke = %d %s", w.Code, w.Body.String())
	}

	// La clé révoquée n'apparaît plus.
	w = doKeys(r, http.MethodGet, "/v1/settings/api-keys", fx.OwnerID, "")
	if strings.Contains(w.Body.String(), "Intégration") {
		t.Fatal("clé révoquée toujours listée")
	}
}
