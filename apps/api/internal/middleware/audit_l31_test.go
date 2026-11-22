package middleware

// =====================================================================
// 🔎 Audit L31 — rouges reproductibles de la sécurité d'entrée
// =====================================================================

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/qoefi/api/internal/database"
)

// auditBrokenPool rend un pool injoignable : toute requête échoue avec une
// erreur réseau (jamais ErrNoRows).
func auditBrokenPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	p, err := pgxpool.New(context.Background(),
		"postgres://audit:audit@127.0.0.1:1/audit?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatalf("pool de test: %v", err)
	}
	t.Cleanup(p.Close)
	return p
}

// TestAuditL31_APIKeyOutageIsNotUnauthorized : une panne de base rendue en 401
// « Clé API invalide ». L'intégrateur conclut que sa clé est morte (rotation,
// appel support) alors que le service est simplement indisponible ; asynq/CI
// ne réessaient pas sur un 4xx.
func TestAuditL31_APIKeyOutageIsNotUnauthorized(t *testing.T) {
	h := APIKeyAuth(db.New(auditBrokenPool(t)))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles", nil)
	req.Header.Set("Authorization", "Bearer qoe_live_0123456789abcdef")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("panne de base rendue en %d (%s), attendu 503", rec.Code, rec.Body.String())
	}
}

// TestAuditL31_CombinedAuthOutageIsNotUnauthorized : même défaut sur le chemin
// combiné (JWT ou clé API) : la clé API n'est pas résolue (panne), on retombe
// sur la validation JWT et le client reçoit « Token invalide ou expiré ».
func TestAuditL31_CombinedAuthOutageIsNotUnauthorized(t *testing.T) {
	auth := NewAuth("router-test-secret-0123456789", "")
	h := auth.CombinedAuth(db.New(auditBrokenPool(t)))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/articles", nil)
	req.Header.Set("Authorization", "Bearer qoe_live_0123456789abcdef")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("panne de base rendue en %d (%s), attendu 503", rec.Code, rec.Body.String())
	}
}

// TestAuditL31_CORSRefusesUnknownOriginWithoutAllowlist : une allowlist vide
// (configuration absente) autorise TOUTES les origines. Le défaut sûr est de
// n'autoriser aucune origine : l'absence de configuration n'est pas un
// consentement.
func TestAuditL31_CORSRefusesUnknownOriginWithoutAllowlist(t *testing.T) {
	h := CORS(nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Origin", "https://attaquant.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("origine non configurée autorisée : Access-Control-Allow-Origin=%q", got)
	}
}

// TestAuditL31_IdempotencyKeyIncludesQuery : la clé d'idempotence ignore la
// query string. Deux requêtes différentes (filtre, portée, page) partageant
// Idempotency-Key rejouent la première réponse : le client reçoit le résultat
// d'une autre opération.
func TestAuditL31_IdempotencyKeyIncludesQuery(t *testing.T) {
	rc := idemRedis(t)
	var calls int
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
	})
	h := Idempotency(rc, time.Hour)(inner)

	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/import?scope=draft", "k1", "user-1"))
	h.ServeHTTP(httptest.NewRecorder(), idemRequest(http.MethodPost, "/v1/import?scope=published", "k1", "user-1"))

	if calls != 2 {
		t.Fatalf("handler exécuté %d fois, attendu 2 : la query string doit faire partie de la clé", calls)
	}
}

// TestAuditL31_ClientIPIgnoresSpoofedHeaders : l'IP client est choisie par
// l'en-tête X-Real-IP, que le client envoie lui-même (aucun proxy ne le
// réécrit). Changer cette valeur à chaque requête change de seau de
// rate-limiting et fausse les journaux d'audit.
func TestAuditL31_ClientIPIgnoresSpoofedHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/posts", nil)
	req.RemoteAddr = "203.0.113.7:53144"
	req.Header.Set("X-Real-IP", "9.9.9.9")

	if got := ClientIP(req); got != "203.0.113.7" {
		t.Fatalf("ClientIP = %q, attendu l'adresse de connexion 203.0.113.7 (X-Real-IP non fiable sans proxy)", got)
	}
}
