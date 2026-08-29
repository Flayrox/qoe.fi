package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func formReq(method, path string, form url.Values) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h := NewHandler(newService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	r.Post("/v1/oauth/token", h.Token())
	req := httptest.NewRequest(method, path, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func jsonReq(method, path, userID, body string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h := NewHandler(newService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	r.Post("/v1/oauth/token", h.Token())
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestIntrospectRevokeHTTP(t *testing.T) {
	fx := seedOAuth(t)
	ctx := context.Background()
	svc := newService()

	const redirectURI = "https://app.example.com/cb"
	clientID, clientSecret, _ := seedApprovedClient(t, fx, redirectURI)
	verifier := "verifier-verifier-verifier-verifier-99"
	approve := svc.ApproveAuthorization(ctx, fx.OwnerID, &AuthorizeRequest{
		ResponseType:        "code",
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		Scope:               "openid",
		CodeChallenge:       pkceS256(verifier),
		CodeChallengeMethod: "S256",
	}, false)
	u, _ := url.Parse(approve.Redirect)
	code := u.Query().Get("code")
	client, _ := svc.AuthenticateClient(ctx, clientID, clientSecret)
	tok, _ := svc.Token(ctx, &TokenRequest{
		GrantType: "authorization_code", Code: code, RedirectURI: redirectURI, CodeVerifier: verifier,
	}, client)
	if tok == nil || tok.AccessToken == "" {
		t.Fatal("token authorization_code vide")
	}

	// Introspect valide (Basic auth) → 200 actif.
	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/introspect",
		strings.NewReader(url.Values{"token": {tok.AccessToken}}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(clientID, clientSecret)
	w := httptest.NewRecorder()
	chiRouter().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("introspect = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}

	// Introspect avec de mauvais credentials → 401.
	req2 := httptest.NewRequest(http.MethodPost, "/v1/oauth/introspect",
		strings.NewReader(url.Values{"token": {tok.AccessToken}}.Encode()))
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req2.SetBasicAuth(clientID, "mauvais-secret")
	w2 := httptest.NewRecorder()
	chiRouter().ServeHTTP(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("introspect mauvais creds = %d, attendu 401", w2.Code)
	}

	// Introspect sans token → pas de 5xx.
	w3 := formReq(http.MethodPost, "/v1/oauth/introspect", url.Values{})
	if w3.Code >= 500 {
		t.Fatalf("introspect sans token = %d, pas de 5xx attendu", w3.Code)
	}

	// ParseForm en échec (content-type non form) → 400 explicite.
	r := chi.NewRouter()
	h := NewHandler(newService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	bad := httptest.NewRequest(http.MethodPost, "/v1/oauth/introspect", strings.NewReader("%zz"))
	bad.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	wBad := httptest.NewRecorder()
	r.ServeHTTP(wBad, bad)
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("introspect parseform = %d, attendu 400", wBad.Code)
	}

	// Userinfo par POST form (access_token) → 200 (avant révocation).
	w6 := formReq(http.MethodPost, "/v1/oauth/userinfo", url.Values{"access_token": {tok.AccessToken}})
	if w6.Code != http.StatusOK {
		t.Fatalf("userinfo form = %d, attendu 200 (body %s)", w6.Code, w6.Body.String())
	}

	// Revoke valide → 200.
	w4 := formReq(http.MethodPost, "/v1/oauth/revoke", url.Values{
		"client_id": {clientID}, "client_secret": {clientSecret}, "token": {tok.AccessToken},
	})
	if w4.Code != http.StatusOK {
		t.Fatalf("revoke = %d, attendu 200 (body %s)", w4.Code, w4.Body.String())
	}
	// Revoke mauvais creds → 401.
	w5 := formReq(http.MethodPost, "/v1/oauth/revoke", url.Values{
		"client_id": {clientID}, "client_secret": {"mauvais"}, "token": {"x"},
	})
	if w5.Code != http.StatusUnauthorized {
		t.Fatalf("revoke mauvais creds = %d, attendu 401", w5.Code)
	}
	// Userinfo sans token → 401.
	w7 := formReq(http.MethodPost, "/v1/oauth/userinfo", url.Values{})
	if w7.Code != http.StatusUnauthorized {
		t.Fatalf("userinfo sans token = %d, attendu 401", w7.Code)
	}
}

func TestClientsManagementHTTP(t *testing.T) {
	fx := seedOAuth(t)

	const redirectURI = "https://app.example.com/cb"
	_, _, dbID := seedApprovedClient(t, fx, redirectURI)

	w := jsonReq(http.MethodGet, "/v1/oauth/clients", fx.OwnerID, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "clients") {
		t.Fatalf("list clients = %d %s", w.Code, w.Body.String())
	}
	// Le listing est autorisé pour tout utilisateur identifié (200).
	w2 := jsonReq(http.MethodGet, "/v1/oauth/clients", fx.ViewerID, "")
	if w2.Code != http.StatusOK {
		t.Fatalf("list viewer = %d, attendu 200", w2.Code)
	}
	// Anonyme → 401.
	w3 := jsonReq(http.MethodGet, "/v1/oauth/clients", "", "")
	if w3.Code != http.StatusUnauthorized {
		t.Fatalf("list anonyme = %d, attendu 401", w3.Code)
	}
	// Rotate secret → 200.
	w4 := jsonReq(http.MethodPost, "/v1/oauth/clients/"+dbID+"/rotate-secret", fx.OwnerID, "")
	if w4.Code != http.StatusOK || !strings.Contains(w4.Body.String(), "clientSecret") {
		t.Fatalf("rotate = %d %s", w4.Code, w4.Body.String())
	}
	// Revoke (DELETE) du client → 200.
	w5 := jsonReq(http.MethodDelete, "/v1/oauth/clients/"+dbID, fx.OwnerID, "")
	if w5.Code != http.StatusOK {
		t.Fatalf("revoke client = %d %s", w5.Code, w5.Body.String())
	}
	// CreateClient : JSON invalide → 400.
	w6 := jsonReq(http.MethodPost, "/v1/oauth/clients", fx.OwnerID, "{bad")
	if w6.Code != http.StatusBadRequest {
		t.Fatalf("create bad json = %d, attendu 400", w6.Code)
	}
}

func TestServicePureBranches(t *testing.T) {
	seedOAuth(t)
	svc := newService()
	ctx := context.Background()

	// Cleanup : intervalle 0 → défaut ; ctx annulé → sortie immédiate.
	ctxCancel, cancel := context.WithCancel(ctx)
	cancel()
	done := make(chan struct{})
	go func() {
		Cleanup(ctxCancel, svc, 0)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Cleanup n'a pas rendu la main avec ctx annulé")
	}

	// Purge best-effort (ne doit pas paniquer).
	svc.Purge(ctx)

	// DenyAuthorization : résultat refusé.
	res := svc.DenyAuthorization(&AuthorizeRequest{ClientID: "c", RedirectURI: "https://x/cb"})
	if res == nil || res.OK || res.Error == "" || res.Redirect == "" {
		t.Fatalf("DenyAuthorization = %+v", res)
	}

	// coversScopes.
	if !coversScopes([]string{"openid", "profile"}, []string{"openid"}) {
		t.Fatal("coversScopes(openid+profile, openid) attendu true")
	}
	if coversScopes([]string{"openid"}, []string{"openid", "profile"}) {
		t.Fatal("coversScopes(openid, openid+profile) attendu false")
	}

	// parseECPrivateKey : clé invalide → false.
	if _, _, ok := parseECPrivateKey("pas une clé"); ok {
		t.Fatal("parseECPrivateKey invalide attendu false")
	}

	// SetClientStatus sur un client inconnu → no-op idempotent (pas d'erreur).
	if err := svc.SetClientStatus(ctx, "introuvable", "APPROVED"); err != nil {
		t.Fatalf("SetClientStatus inconnu = %v, attendu nil (no-op)", err)
	}
}

func TestAuthorizeHandlersAndToken(t *testing.T) {
	fx := seedOAuth(t)

	const redirectURI = "https://app.example.com/cb"
	clientID, _, _ := seedApprovedClient(t, fx, redirectURI)

	// beginAuthorize sans user → 401 ; avec user → 200 (info de consentement).
	challenge := pkceS256("verifier-verifier-verifier-verifier-99")
	beginQuery := "client_id=" + clientID + "&redirect_uri=" + redirectURI +
		"&scope=openid&response_type=code&code_challenge=" + challenge + "&code_challenge_method=S256"
	w0 := jsonReq(http.MethodGet, "/v1/oauth/authorize?"+beginQuery, "", "")
	if w0.Code != http.StatusUnauthorized {
		t.Fatalf("authorize anonyme = %d, attendu 401", w0.Code)
	}
	w := jsonReq(http.MethodGet, "/v1/oauth/authorize?"+beginQuery, fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("begin authorize = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	var begin struct {
		OK   bool `json:"ok"`
		Info *struct {
			ClientID string `json:"clientId"`
		} `json:"info"`
	}
	if err := jsonUnmarshal(w.Body.Bytes(), &begin); err != nil || !begin.OK || begin.Info == nil {
		t.Fatalf("begin = %+v (err %v)", begin, err)
	}

	// decideAuthorize : deny → OK:false avec redirection d'erreur.
	w2 := jsonReq(http.MethodPost, "/v1/oauth/authorize", fx.OwnerID,
		`{"clientId":"`+clientID+`","redirectUri":"`+redirectURI+`","decision":"deny"}`)
	if w2.Code != http.StatusOK {
		t.Fatalf("decide deny = %d, attendu 200 (body %s)", w2.Code, w2.Body.String())
	}
	// JSON invalide → 400.
	w3 := jsonReq(http.MethodPost, "/v1/oauth/authorize", fx.OwnerID, "{bad")
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("decide bad json = %d, attendu 400", w3.Code)
	}

	// Token endpoint : corps non form-encodé → pas de 5xx.
	w4 := jsonReq(http.MethodPost, "/v1/oauth/token", "", `{"grant_type":"x"}`)
	if w4.Code >= 500 {
		t.Fatalf("token bad form = %d, pas de 5xx attendu", w4.Code)
	}

	// applySetting : chaque clé applique sa valeur, les valeurs invalides sont ignorées.
	s := defaultSettings()
	applySetting(&s, "OAUTH_MAX_CLIENTS_PER_USER", "7")
	if s.MaxClientsPerUser != 7 {
		t.Fatalf("MaxClientsPerUser = %d, attendu 7", s.MaxClientsPerUser)
	}
	applySetting(&s, "OAUTH_AUTH_CODE_TTL", "300")
	if s.AuthCodeTTL != 300*time.Second {
		t.Fatalf("AuthCodeTTL = %v", s.AuthCodeTTL)
	}
	applySetting(&s, "OAUTH_MAX_CLIENTS_PER_USER", "abc")
	if s.MaxClientsPerUser != 7 {
		t.Fatal("valeur invalide appliquée")
	}
	applySetting(&s, "CLÉ_INCONNUE", "42")

	// parseECPrivateKey avec une vraie clé EC (PKCS8).
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen key: %v", err)
	}
	d, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	pemBlock := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: d})
	if _, _, ok := parseECPrivateKey(string(pemBlock)); !ok {
		t.Fatal("parseECPrivateKey valide attendu true")
	}
}

func jsonUnmarshal(b []byte, v any) error {
	return json.Unmarshal(b, v)
}

func chiRouter() http.Handler {
	r := chi.NewRouter()
	h := NewHandler(newService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	r.Post("/v1/oauth/token", h.Token())
	return r
}
