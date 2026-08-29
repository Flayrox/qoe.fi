package middleware

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// signHS crée un JWT HS256 signé avec le secret donné.
func signHS(t *testing.T, secret []byte, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(secret)
	if err != nil {
		t.Fatalf("sign HS256: %v", err)
	}
	return s
}

func TestAuthMiddleware_ValidHS256(t *testing.T) {
	a := NewAuth("secret-dev", "") // pas de JWKS
	var gotSub string
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSub, _ = UserID(r.Context())
		if Claims(r.Context()) == nil {
			t.Error("Claims absent du contexte")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	token := signHS(t, []byte("secret-dev"), jwt.MapClaims{"sub": "uid-1", "email": "a@b"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent || gotSub != "uid-1" {
		t.Errorf("code=%d sub=%q", rr.Code, gotSub)
	}
}

func TestAuthMiddleware_MissingHeader(t *testing.T) {
	a := NewAuth("secret", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("code = %d, attendu 401", rr.Code)
	}
}

func TestAuthMiddleware_NonBearer(t *testing.T) {
	a := NewAuth("secret", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic abc")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("code = %d, attendu 401", rr.Code)
	}
}

func TestAuthMiddleware_BadToken(t *testing.T) {
	a := NewAuth("secret", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer not.a.jwt")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("code = %d, attendu 401", rr.Code)
	}
}

func TestAuthMiddleware_TokenNoSub(t *testing.T) {
	a := NewAuth("secret", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	token := signHS(t, []byte("secret"), jwt.MapClaims{"email": "a@b"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("sans sub, code = %d, attendu 401", rr.Code)
	}
}

func TestAuthMiddleware_Expired(t *testing.T) {
	a := NewAuth("secret", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	token := signHS(t, []byte("secret"), jwt.MapClaims{
		"sub": "uid", "email": "a@b", "exp": time.Now().Add(-time.Hour).Unix(),
	})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expiré, code = %d, attendu 401", rr.Code)
	}
}

func TestAuthMiddleware_WrongSecret(t *testing.T) {
	a := NewAuth("secret-A", "")
	h := a.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	token := signHS(t, []byte("secret-B"), jwt.MapClaims{"sub": "uid"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("mauvais secret, code = %d, attendu 401", rr.Code)
	}
}

func TestHmacSecret(t *testing.T) {
	// sb_secret_ + base64 sans padding → décodé.
	a := NewAuth("sb_secret_dGVzdA", "")
	got := a.hmacSecret()
	if string(got) != "test" {
		t.Errorf("sb_secret_ b64 sans padding = %q, attendu test", got)
	}
	// Secret brut retourné tel quel.
	a2 := NewAuth("raw-secret", "")
	if string(a2.hmacSecret()) != "raw-secret" {
		t.Errorf("secret brut = %q", a2.hmacSecret())
	}
	// Vide.
	a3 := NewAuth("", "")
	if a3.hmacSecret() != nil {
		t.Error("secret vide → nil")
	}
	// b64 avec padding explicite.
	a4 := NewAuth("sb_secret_"+base64.StdEncoding.EncodeToString([]byte("hello")), "")
	if string(a4.hmacSecret()) != "hello" {
		t.Errorf("bd64 padding = %q", a4.hmacSecret())
	}
}

func TestJwksAlgorithmAllowed(t *testing.T) {
	if !jwksAlgorithmAllowed("RS256", jwkKey{Kty: "RSA"}) {
		t.Error("RS256/RSA doit être autorisé")
	}
	if jwksAlgorithmAllowed("HS256", jwkKey{Kty: "RSA"}) {
		t.Error("HS256/RSA doit être refusé")
	}
	if !jwksAlgorithmAllowed("ES256", jwkKey{Kty: "EC", Crv: "P-256"}) {
		t.Error("ES256/P-256 doit être autorisé")
	}
	if !jwksAlgorithmAllowed("ES384", jwkKey{Kty: "EC", Crv: "P-384"}) {
		t.Error("ES384/P-384 doit être autorisé")
	}
	if !jwksAlgorithmAllowed("ES512", jwkKey{Kty: "EC", Crv: "P-521"}) {
		t.Error("ES512/P-521 doit être autorisé")
	}
	if jwksAlgorithmAllowed("RS256", jwkKey{Kty: "EC", Crv: "P-256"}) {
		t.Error("RS256/P-256 doit être refusé")
	}
	if jwksAlgorithmAllowed("ES256", jwkKey{Kty: "ED"}) {
		t.Error("type ED doit être refusé")
	}
}

func TestGetJWKS_FetchAndCache(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[{"kty":"RSA","kid":"k1","n":"","e":""}]}`))
	}))
	defer srv.Close()

	a := &Auth{jwksURL: srv.URL}
	s1, err := a.getJWKS()
	if err != nil {
		t.Fatalf("getJWKS: %v", err)
	}
	if len(s1.Keys) != 1 {
		t.Fatalf("keys = %d", len(s1.Keys))
	}
	// Second appel → cache (pas de hit HTTP).
	s2, _ := a.getJWKS()
	if hits != 1 {
		t.Errorf("hits = %d, attendu 1 (cache)", hits)
	}
	if s1 != s2 {
		t.Error("le JWKS caché doit être la même instance")
	}
}

func TestGetJWKS_BadStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	a := &Auth{jwksURL: srv.URL}
	if _, err := a.getJWKS(); err == nil {
		t.Error("status 500 doit échouer")
	}
}

func TestGetJWKS_NetworkError(t *testing.T) {
	a := &Auth{jwksURL: "http://127.0.0.1:0/invalid"}
	if _, err := a.getJWKS(); err == nil {
		t.Error("erreur réseau doit échouer")
	}
}

func TestOptionalAuth(t *testing.T) {
	a := NewAuth("secret", "")
	// Sans header → passe (pas d'auth).
	var hasUser bool
	h := a.OptionalAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, hasUser = UserID(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
	if rr.Code != http.StatusNoContent || hasUser {
		t.Errorf("code=%d hasUser=%v", rr.Code, hasUser)
	}

	// Token valide → UID injecté.
	hasUser = false
	var gotSub string
	h2 := a.OptionalAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSub, hasUser = UserID(r.Context())
	}))
	token := signHS(t, []byte("secret"), jwt.MapClaims{"sub": "uid-opt"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	h2.ServeHTTP(httptest.NewRecorder(), req)
	if !hasUser || gotSub != "uid-opt" {
		t.Errorf("sub=%q hasUser=%v", gotSub, hasUser)
	}

	// Token invalide → passe quand même (optionnel).
	hasUser = true
	bad := httptest.NewRequest(http.MethodGet, "/", nil)
	bad.Header.Set("Authorization", "Bearer invalid.jwt")
	h2.ServeHTTP(httptest.NewRecorder(), bad)
	if hasUser {
		t.Error("token invalide optionnel → pas d'UID")
	}
	// "Bearer " littéral sans token → passe.
	noTok := httptest.NewRequest(http.MethodGet, "/", nil)
	noTok.Header.Set("Authorization", "Bearer ")
	h2.ServeHTTP(httptest.NewRecorder(), noTok)
}

func TestJWKSFromToken_RSA(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("rsa: %v", err)
	}
	n := base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes())
	e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"keys":[{"kty":"RSA","kid":"k1","n":"` + n + `","e":"` + e + `"}]}`))
	}))
	defer srv.Close()
	a := &Auth{jwksURL: srv.URL}

	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"sub": "ku"})
	signed, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign RS256: %v", err)
	}
	claims, err := a.parseToken(signed)
	if err != nil {
		t.Fatalf("parseToken RS256: %v", err)
	}
	if claims == nil || claims["sub"] != "ku" {
		t.Errorf("sub = %v", claims["sub"])
	}
}
func TestNewAuth_BuildsJWKSURL(t *testing.T) {
	a := NewAuth("", "https://supabase.project.co/")
	if a.jwksURL != "https://supabase.project.co/auth/v1/.well-known/jwks.json" {
		t.Errorf("jwksURL = %q", a.jwksURL)
	}
	a2 := NewAuth("", "")
	if a2.jwksURL != "" {
		t.Errorf("sans URL auth, jwksURL = %q, attendu vide", a2.jwksURL)
	}
}

func TestCombinedAuth_APIKeyNeedsDB(t *testing.T) {
	// APIKeyAuth / CombinedAuth exigent un *db.Queries (base réelle).
	// On vérifie seulement que la construction ne panique pas et que le
	// chemin JWT fonctionne via CombinedAuth sans clé API.
	a := NewAuth("secret", "")
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if sub, ok := UserID(r.Context()); !ok || sub != "uid-comb" {
			t.Errorf("CombinedAuth JWT: sub=%q ok=%v", sub, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	h := a.CombinedAuth(nil)(inner)
	token := signHS(t, []byte("secret"), jwt.MapClaims{"sub": "uid-comb"})
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Errorf("CombinedAuth JWT code = %d", rr.Code)
	}
}

