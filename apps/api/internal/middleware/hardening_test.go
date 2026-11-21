package middleware

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// buildJWKForModulus construit un jwkKey RSA à partir d'un modulus brut.
func buildJWKForModulus(n []byte, e int) jwkKey {
	eBytes := []byte{}
	for shift := 24; shift >= 0; shift -= 8 {
		if b := byte(e >> uint(shift)); b != 0 || len(eBytes) > 0 {
			eBytes = append(eBytes, b)
		}
	}
	return jwkKey{
		Kty: "RSA",
		N:   base64.RawURLEncoding.EncodeToString(n),
		E:   base64.RawURLEncoding.EncodeToString(eBytes),
	}
}

// Une clé JWKS de 1024 bits (ou un exposant dégénéré) ne doit pas être acceptée
// pour vérifier des JWT : la taille minimale est une règle de sécurité, pas une
// préférence. Aujourd'hui buildRSAKey accepte tout.
func TestBuildRSAKey_RefuseCleFaible(t *testing.T) {
	weak := buildJWKForModulus(bytes.Repeat([]byte{0xff}, 128), 65537)
	if _, err := buildRSAKey(weak); err == nil {
		t.Fatal("modulus de 1024 bits accepté : clé de signature cassable")
	}

	strong := bytes.Repeat([]byte{0xff}, 256) // 2048 bits
	if k, err := buildRSAKey(buildJWKForModulus(strong, 65537)); err != nil || k == nil {
		t.Fatalf("clé 2048 bits refusée à tort : %v", err)
	}

	if _, err := buildRSAKey(buildJWKForModulus(strong, 1)); err == nil {
		t.Fatal("exposant 1 accepté : signature forgeable")
	}
}

// Redis indisponible n'est pas « une requête identique est déjà en cours » :
// répondre 409 bloque toutes les écritures CMS pendant une panne Redis, avec
// un message faux. L'indisponibilité doit être annoncée comme telle (503).
func TestIdempotency_RedisIndisponible_Repond503(t *testing.T) {
	rc := redis.NewClient(&redis.Options{
		Addr:         "127.0.0.1:1",
		DialTimeout:  20 * time.Millisecond,
		ReadTimeout:  20 * time.Millisecond,
		WriteTimeout: 20 * time.Millisecond,
		MaxRetries:   -1,
	})
	defer func() { _ = rc.Close() }()

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/articles", nil)
	req.Header.Set(IdempotencyKeyHeader, "cle-1")
	rec := httptest.NewRecorder()

	Idempotency(rc, time.Minute)(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, attendu 503 (indisponibilité, pas un conflit) : corps %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("corps non JSON : %q", rec.Body.String())
	}
}

// Les erreurs 503 du contrôle d'accès sont construites à la main : un message
// contenant un guillemet produisait un corps JSON invalide.
func TestWriteAccessControlJSON_EchappeGuillemets(t *testing.T) {
	for _, msg := range []string{`Endpoint "beta" désactivé`, "ligne\ncassée", `antislash \ seul`} {
		rec := httptest.NewRecorder()
		writeAccessControlJSON(rec, http.StatusNotFound, msg)
		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("corps JSON invalide pour %q : %v (corps %s)", msg, err, rec.Body.String())
		}
		if body["error"] != msg {
			t.Fatalf("error = %v, attendu %q", body["error"], msg)
		}
	}
}
