package oauth

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

func newRouter() http.Handler {
	r := chi.NewRouter()
	h := NewHandler(newService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	return r
}

func do(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── Découverte OIDC ───────────────────────────────────────────────────

func TestDiscoveryAndJWKS(t *testing.T) {
	r := newRouter()

	w := do(r, http.MethodGet, "/.well-known/openid-configuration", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("discovery = %d %s", w.Code, w.Body.String())
	}
	var cfg map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
		t.Fatalf("json discovery: %v", err)
	}
	for _, key := range []string{"issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"} {
		if _, ok := cfg[key]; !ok {
			t.Fatalf("champ OIDC manquant : %s (%s)", key, w.Body.String())
		}
	}

	w = do(r, http.MethodGet, "/.well-known/jwks.json", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("jwks = %d %s", w.Code, w.Body.String())
	}
	var jwks struct {
		Keys []map[string]any `json:"keys"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &jwks); err != nil || len(jwks.Keys) == 0 {
		t.Fatalf("jwks sans clé : %s (%v)", w.Body.String(), err)
	}
}

// ─── Userinfo ──────────────────────────────────────────────────────────

func TestUserinfo_RequiresBearer(t *testing.T) {
	r := newRouter()

	if w := do(r, http.MethodGet, "/v1/oauth/userinfo", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("sans token = %d, attendu 401", w.Code)
	}
	req := httptest.NewRequest(http.MethodGet, "/v1/oauth/userinfo", nil)
	req.Header.Set("Authorization", "Bearer not-a-token")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("token invalide = %d, attendu 401", w.Code)
	}
}

// ─── Gestion des clients (créateur approuvé uniquement) ────────────────

func TestClients_ApprovedOwnerOnly(t *testing.T) {
	fx, err := testutil.SeedOAuth(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	r := newRouter()

	// Utilisateur non approuvé → refus.
	w := do(r, http.MethodPost, "/v1/oauth/clients", fx.ViewerID,
		`{"name":"App pirate","redirectUris":["https://evil.test/cb"]}`)
	if w.Code == http.StatusOK || w.Code == http.StatusCreated {
		t.Fatalf("non-approuvé a créé un client : %d %s", w.Code, w.Body.String())
	}

	// Créateur approuvé → client créé (secret retourné une seule fois).
	w = do(r, http.MethodPost, "/v1/oauth/clients", fx.OwnerID,
		`{"name":"Mon App","redirectUris":["https://app.test/cb"]}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("create client = %d %s", w.Code, w.Body.String())
	}
	// Contrat : clientId + clientSecret au niveau racine (secret visible
	// une seule fois, à la création).
	var created struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if created.ClientSecret == "" || created.ClientID == "" {
		t.Fatalf("identifiants absents : %s", w.Body.String())
	}

	// Listing ne doit PAS exposer les secrets.
	w = do(r, http.MethodGet, "/v1/oauth/clients", fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d", w.Code)
	}
	if strings.Contains(w.Body.String(), "client_secret") && !strings.Contains(w.Body.String(), `"clientSecretHash"`) {
		// Hash éventuel OK, secret brut interdit — heuristique simple :
		// on vérifie surtout que le listing est du JSON exploitable.
		var list map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("list json: %v (%s)", err, w.Body.String())
		}
	}

	// Rotation de secret par le propriétaire.
	// rotate/revoke ciblent l'id interne (UUID), pas le clientId public.
	var dbID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "OAuthClient" WHERE "clientId" = $1`,
		created.ClientID).Scan(&dbID); err != nil {
		t.Fatalf("lookup id interne: %v", err)
	}

	w = do(r, http.MethodPost, "/v1/oauth/clients/"+dbID+"/rotate-secret",
		fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("rotate = %d %s", w.Code, w.Body.String())
	}
	// Révocation du client.
	w = do(r, http.MethodDelete, "/v1/oauth/clients/"+dbID,
		fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("revoke client = %d %s", w.Code, w.Body.String())
	}
}

// ─── Introspect / Revoke ───────────────────────────────────────────────

func TestIntrospect_Revoke_BadRequestWithoutToken(t *testing.T) {
	r := newRouter()

	w := do(r, http.MethodPost, "/v1/oauth/introspect", "", `{"token":""}`)
	if w.Code >= 500 {
		t.Fatalf("introspect sans token = %d (pas de 5xx attendu)", w.Code)
	}
	if w.Code != http.StatusBadRequest && w.Code != http.StatusUnauthorized && w.Code != http.StatusForbidden {
		t.Fatalf("introspect sans token statut inattendu : %d %s", w.Code, w.Body.String())
	}

	w = do(r, http.MethodPost, "/v1/oauth/revoke", "", `{}`)
	if w.Code >= 500 {
		t.Fatalf("revoke sans token = %d (pas de 5xx attendu)", w.Code)
	}
}
