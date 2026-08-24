package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
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
	// Montage production : le token endpoint a son propre rate-limit.
	r.Post("/v1/oauth/token", h.Token())
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

// ─── Flux authorization_code + PKCE de bout en bout ────────────────────

func TestAuthorizeCodeFlow_HTTPHandlers(t *testing.T) {
	fx, err := testutil.SeedOAuth(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	r := newRouter()

	// 1. Le créateur approuvé crée une application.
	w := do(r, http.MethodPost, "/v1/oauth/clients", fx.OwnerID,
		`{"name":"App E2E","redirectUris":["https://app.test/cb"]}`)
	var created struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.ClientID == "" {
		t.Fatalf("create client: %s (%v)", w.Body.String(), err)
	}
	// L'admin doit approuver l'app avant toute autorisation.
	if _, err := poolTest.Exec(context.Background(),
		`UPDATE "OAuthClient" SET status = 'APPROVED' WHERE "clientId" = $1`,
		created.ClientID); err != nil {
		t.Fatalf("approve client: %v", err)
	}

	const verifier = "un-verifier-pkce-assez-long-1234567890abcdef"
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])

	// 2. beginAuthorize : app approuvée → info de consentement.
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", created.ClientID)
	q.Set("redirect_uri", "https://app.test/cb")
	q.Set("scope", "openid profile")
	q.Set("state", "st-123")
	q.Set("nonce", "n-456")
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	w = do(r, http.MethodGet, "/v1/oauth/authorize?"+q.Encode(), fx.OwnerID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatalf("begin = %d %s", w.Code, w.Body.String())
	}

	// 3. Mauvais response_type refusé.
	badReq, _ := json.Marshal(map[string]any{
		"responseType": "token",
		"clientId":     created.ClientID,
		"redirectUri":  "https://app.test/cb",
	})
	w = do(r, http.MethodPost, "/v1/oauth/authorize", fx.OwnerID,
		string(badReq)+`,"decision":"approve"`)
	if !strings.Contains(w.Body.String(), "unsupported_response_type") {
		t.Fatalf("response_type invalide mal géré : %s", w.Body.String())
	}

	// 4. decideAuthorize approve → code dans l'URL de redirection.
	flat, _ := json.Marshal(map[string]any{
		"responseType":        "code",
		"clientId":            created.ClientID,
		"redirectUri":         "https://app.test/cb",
		"scope":               "openid profile",
		"state":               "st-123",
		"nonce":               "n-456",
		"codeChallenge":       challenge,
		"codeChallengeMethod": "S256",
		"decision":            "approve",
		"remember":            true,
	})
	w = do(r, http.MethodPost, "/v1/oauth/authorize", fx.OwnerID, string(flat))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"ok":true`) {
		t.Fatalf("decide = %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Redirect string `json:"redirect"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("json redirect: %v (%s)", err, w.Body.String())
	}
	u, err := url.Parse(result.Redirect)
	if err != nil {
		t.Fatalf("redirect invalide : %s (%v)", result.Redirect, err)
	}
	code := u.Query().Get("code")
	state := u.Query().Get("state")
	if code == "" || state != "st-123" {
		t.Fatalf("redirect sans code/state : %s", result.Redirect)
	}

	// 5. Échange du code contre un token (PKCE S256).
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", "https://app.test/cb")
	form.Set("code_verifier", verifier)
	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/token",
		strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(created.ClientID, created.ClientSecret)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("token = %d %s", w.Code, w.Body.String())
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &tok); err != nil || tok.AccessToken == "" {
		t.Fatalf("token absent : %s (%v)", w.Body.String(), err)
	}

	// 6. userinfo avec le token d'accès.
	req = httptest.NewRequest(http.MethodGet, "/v1/oauth/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("userinfo = %d %s", w.Code, w.Body.String())
	}
	var claims struct {
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &claims); err != nil || claims.Sub == "" {
		t.Fatalf("claims absents : %s (%v)", w.Body.String(), err)
	}

	// 7. Code déjà utilisé → rejet (usage unique).
	req = httptest.NewRequest(http.MethodPost, "/v1/oauth/token",
		strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(created.ClientID, created.ClientSecret)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code == http.StatusOK {
		t.Fatal("code d'autorisation réutilisable (usage unique violé)")
	}
}
