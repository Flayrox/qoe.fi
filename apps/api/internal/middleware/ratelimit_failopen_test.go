package middleware

import (
	"bytes"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/qoefi/api/internal/observability"
)

// deadRedis rend un client pointant vers un port fermé : chaque commande
// échoue immédiatement (aucun service à démarrer, aucune reprise).
func deadRedis() *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:         "127.0.0.1:1",
		MaxRetries:   -1,
		DialTimeout:  100 * time.Millisecond,
		ReadTimeout:  100 * time.Millisecond,
		WriteTimeout: 100 * time.Millisecond,
	})
}

// failOpenMetric lit le compteur Prometheus exposé pour (namespace, fail_open).
// C'est la preuve publiée : pas une variable interne de test.
func failOpenMetric(t *testing.T, namespace string) uint64 {
	t.Helper()
	want := fmt.Sprintf(`qoe_ratelimit_decisions_total{namespace=%q,result="fail_open"} `, namespace)
	for _, line := range strings.Split(observability.Default().Render(), "\n") {
		if !strings.HasPrefix(line, want) {
			continue
		}
		value, err := strconv.ParseUint(strings.TrimSpace(strings.TrimPrefix(line, want)), 10, 64)
		if err != nil {
			t.Fatalf("valeur illisible dans %q : %v", line, err)
		}
		return value
	}
	return 0
}

// captureSlog redirige le logger par défaut et rend ce qui a été écrit.
func captureSlog(t *testing.T) func() string {
	t.Helper()
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	return func() string {
		slog.SetDefault(previous)
		return buf.String()
	}
}

func runThrough(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	return rr
}

// TestRateLimitFailOpenTrace — chemin 1 (RateLimit → serveWithGCRA) : Redis en
// panne ⇒ la requête passe, la décision est chiffrée « fail_open » et le log
// throttlé est émis.
func TestRateLimitFailOpenTrace(t *testing.T) {
	namespace := "test-failopen-simple"
	before := failOpenMetric(t, namespace)
	lastRateLimitWarnUnixNano.Store(0)
	dump := captureSlog(t)
	defer dump()

	rc := deadRedis()
	defer rc.Close()
	handler := RateLimit(namespace, rc, time.Minute, 5, false)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := runThrough(handler, httptest.NewRequest(http.MethodGet, "/v1/feed", nil))
	logs := dump()

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, une panne Redis ne doit jamais échouer la requête", rr.Code)
	}
	if got := failOpenMetric(t, namespace); got != before+1 {
		t.Errorf("compteur fail_open = %d, attendu %d", got, before+1)
	}
	if !strings.Contains(logs, "fail-open") {
		t.Errorf("aucun log de fail-open : %q", logs)
	}
}

// TestRateLimitDualFailOpenUtilisateur — chemin 2 (seau utilisateur).
func TestRateLimitDualFailOpenUtilisateur(t *testing.T) {
	namespace := "test-failopen-dual-user"
	before := failOpenMetric(t, namespace)
	lastRateLimitWarnUnixNano.Store(0)
	dump := captureSlog(t)
	defer dump()

	rc := deadRedis()
	defer rc.Close()
	handler := RateLimitDual(namespace, rc, time.Minute, 5, 0, 0)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := runThrough(handler, httptest.NewRequest(http.MethodGet, "/v1/thoughts", nil))
	logs := dump()

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (fail-open)", rr.Code)
	}
	if got := failOpenMetric(t, namespace); got != before+1 {
		t.Errorf("compteur fail_open = %d, attendu %d", got, before+1)
	}
	if !strings.Contains(logs, "fail-open") {
		t.Errorf("aucun log de fail-open : %q", logs)
	}
}

// TestRateLimitDualFailOpenSousReseau — chemin 3 (seau sous-réseau, après un
// premier seau sauté : userWin=0 isole le chemin).
func TestRateLimitDualFailOpenSousReseau(t *testing.T) {
	namespace := "test-failopen-dual-subnet"
	before := failOpenMetric(t, namespace)
	lastRateLimitWarnUnixNano.Store(0)
	dump := captureSlog(t)
	defer dump()

	rc := deadRedis()
	defer rc.Close()
	handler := RateLimitDual(namespace, rc, 0, 0, time.Minute, 5)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := runThrough(handler, httptest.NewRequest(http.MethodGet, "/v1/thoughts", nil))
	logs := dump()

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (fail-open)", rr.Code)
	}
	if got := failOpenMetric(t, namespace); got != before+1 {
		t.Errorf("compteur fail_open = %d, attendu %d", got, before+1)
	}
	if !strings.Contains(logs, "fail-open") {
		t.Errorf("aucun log de fail-open : %q", logs)
	}
}
