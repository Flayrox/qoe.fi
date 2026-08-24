package creator

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// insertAPIKey insère une clé avec les scopes donnés et renvoie la clé
// en clair (format qoe_live_…).
func insertAPIKey(t *testing.T, userID, name string, scopes []string) string {
	t.Helper()
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		t.Fatalf("rand: %v", err)
	}
	key := "qoe_live_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(key))
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId")
		 VALUES (gen_random_uuid()::text, $1, 'qoe_live', $2, $3, $4)`,
		name, hex.EncodeToString(sum[:]), scopes, userID); err != nil {
		t.Fatalf("insert api key: %v", err)
	}
	return key
}

// newAPIRouter reproduit le montage production : APIKeyAuth puis
// RegisterAPIKey (routes consommables par clé créateur).
func newAPIRouter() http.Handler {
	h := NewHandler(poolTest, nil, "")
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(authmw.APIKeyAuth(db.New(poolTest)))
		h.RegisterAPIKey(api)
	})
	return r
}

func TestCreatorAPI_FullScopeKeyAllowed(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()
	key := insertAPIKey(t, fx.AuthorID, "full", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("clé complète = %d %s, attendu 200", w.Code, w.Body.String())
	}
	var res struct {
		Data struct {
			Stats map[string]int `json:"stats"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if _, ok := res.Data.Stats["pageviews"]; !ok {
		t.Fatalf("shape stats attendue : %s", w.Body.String())
	}

	// lastUsedAt mis à jour par l'authentification.
	var used *bool
	rows, err := poolTest.Query(context.Background(),
		`SELECT "lastUsedAt" IS NOT NULL FROM "ApiKey" WHERE "userId" = $1`, fx.AuthorID)
	if err != nil {
		t.Fatalf("query lastUsed: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var u bool
		if err := rows.Scan(&u); err != nil {
			t.Fatalf("scan: %v", err)
		}
		used = &u
	}
	if used == nil || !*used {
		t.Fatal("lastUsedAt non mis à jour après usage")
	}
}

func TestCreatorAPI_ScopeEnforcement(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()

	// Clé limitée au scope READ : /analytics/stats exige ANALYTICS → 403.
	readonly := insertAPIKey(t, fx.ViewerID, "readonly", []string{authmw.ScopeRead})
	req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
	req.Header.Set("Authorization", "Bearer "+readonly)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("scope READ sur route ANALYTICS = %d %s, attendu 403", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "ANALYTICS") {
		t.Fatalf("message de scope manquant : %s", w.Body.String())
	}
}

func TestCreatorAPI_RejectsBadCredentials(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newAPIRouter()

	cases := []struct {
		name, header string
	}{
		{"sans header", ""},
		{"pas un bearer", "Basic abc"},
		{"mauvais préfixe", "Bearer sk_live_abcdef"},
		{"clé inconnue", "Bearer qoe_live_" + strings.Repeat("0", 32)},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/v1/analytics/stats", nil)
		if tc.header != "" {
			req.Header.Set("Authorization", tc.header)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s = %d %s, attendu 401", tc.name, w.Code, w.Body.String())
		}
	}
	_ = fx
}

func TestRequireAPIScope_JWTPassesWithoutScopes(t *testing.T) {
	// Une requête JWT (aucun scope en contexte) traverse RequireAPIScope :
	// le RBAC publication s'applique en aval.
	called := false
	handler := authmw.RequireAPIScope(authmw.ScopeAnalytics)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if !called || w.Code != http.StatusOK {
		t.Fatal("JWT sans scopes doit passer le middleware de scope")
	}

	// Clé API limitée à READ : bloquée pour ANALYTICS.
	ctx := context.WithValue(req.Context(), authmw.ScopesKey, []string{authmw.ScopeRead})
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req.WithContext(ctx))
	if w.Code != http.StatusForbidden {
		t.Fatalf("READ sur route ANALYTICS = %d, attendu 403", w.Code)
	}
}
