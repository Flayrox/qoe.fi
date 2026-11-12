package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/qoefi/api/internal/pow"
	"github.com/redis/go-redis/v9"
)

func solveTestChallenge(t *testing.T, ch pow.Challenge) string {
	t.Helper()
	for n := 0; n <= ch.MaxNumber; n++ {
		sum := sha256.Sum256([]byte(ch.Salt + strconv.Itoa(n)))
		if hex.EncodeToString(sum[:]) == ch.Challenge {
			payload, err := json.Marshal(pow.Solution{
				Algorithm: ch.Algorithm,
				Challenge: ch.Challenge,
				Salt:      ch.Salt,
				Number:    n,
				MaxNumber: ch.MaxNumber,
				ExpiresAt: ch.ExpiresAt,
				Signature: ch.Signature,
			})
			if err != nil {
				t.Fatalf("marshal pow solution: %v", err)
			}
			return base64.StdEncoding.EncodeToString(payload)
		}
	}
	t.Fatalf("solution PoW introuvable dans [0..%d]", ch.MaxNumber)
	return ""
}

func TestNewRouter_MetricsRequestIDAndPoW(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rc.Close() }()

	const secret = "chaos-test-internal-secret"
	r := newRouter(RouterDeps{
		Redis:          rc,
		InternalSecret: secret,
	})

	// 1. X-Request-Id généré et propagé sur GET /healthz.
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if w1.Code != http.StatusOK {
		t.Fatalf("GET /healthz = %d", w1.Code)
	}
	if w1.Header().Get("X-Request-Id") == "" {
		t.Fatal("X-Request-Id absent de la réponse")
	}

	// 2. /metrics protégé par le secret interne et expose les métriques Prometheus.
	wUnauth := httptest.NewRecorder()
	r.ServeHTTP(wUnauth, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("GET /metrics sans secret = %d, attendu 401", wUnauth.Code)
	}

	reqMetrics := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	reqMetrics.Header.Set("x-qoe-internal-secret", secret)
	wMetrics := httptest.NewRecorder()
	r.ServeHTTP(wMetrics, reqMetrics)
	if wMetrics.Code != http.StatusOK {
		t.Fatalf("GET /metrics avec secret = %d", wMetrics.Code)
	}
	body := wMetrics.Body.String()
	if !strings.Contains(body, "qoe_http_requests_total") || !strings.Contains(body, "qoe_http_request_duration_ms_bucket") {
		t.Fatalf("métriques Prometheus manquantes dans /metrics:\n%s", body)
	}

	// 3. GET /v1/security/challenge + PoW burst (3 libres, 4e requiert challenge).
	burstMW := requirePoWOnBurst(rc, secret, 3, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/support/public/tickets", nil)
		req.RemoteAddr = "198.51.100.42:1234"
		w := httptest.NewRecorder()
		burstMW.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("requête %d/3 aurait dû passer sans PoW, obtenu %d", i+1, w.Code)
		}
	}

	// 4e requête sans X-Qoe-Challenge -> 428 CHALLENGE_REQUIRED + challenge JSON.
	req4 := httptest.NewRequest(http.MethodPost, "/v1/support/public/tickets", nil)
	req4.RemoteAddr = "198.51.100.42:1234"
	w4 := httptest.NewRecorder()
	burstMW.ServeHTTP(w4, req4)
	if w4.Code != http.StatusPreconditionRequired {
		t.Fatalf("4e requête sans PoW = %d, attendu 428", w4.Code)
	}
	var challengeResp struct {
		Code      string        `json:"code"`
		Challenge pow.Challenge `json:"challenge"`
	}
	if err := json.Unmarshal(w4.Body.Bytes(), &challengeResp); err != nil {
		t.Fatalf("decode challenge response: %v", err)
	}
	if challengeResp.Code != "CHALLENGE_REQUIRED" {
		t.Fatalf("code = %q, attendu CHALLENGE_REQUIRED", challengeResp.Code)
	}

	// Résolution côté client -> passe en 200, puis rejeu du même jeton -> bloqué en 428.
	token := solveTestChallenge(t, challengeResp.Challenge)
	reqSolved := httptest.NewRequest(http.MethodPost, "/v1/support/public/tickets", nil)
	reqSolved.RemoteAddr = "198.51.100.42:1234"
	reqSolved.Header.Set("X-Qoe-Challenge", token)
	wSolved := httptest.NewRecorder()
	burstMW.ServeHTTP(wSolved, reqSolved)
	if wSolved.Code != http.StatusOK {
		t.Fatalf("requête avec PoW valide = %d, attendu 200", wSolved.Code)
	}

	reqReplay := httptest.NewRequest(http.MethodPost, "/v1/support/public/tickets", nil)
	reqReplay.RemoteAddr = "198.51.100.42:1234"
	reqReplay.Header.Set("X-Qoe-Challenge", token)
	wReplay := httptest.NewRecorder()
	burstMW.ServeHTTP(wReplay, reqReplay)
	if wReplay.Code != http.StatusPreconditionRequired {
		t.Fatalf("rejeu PoW = %d, attendu 428", wReplay.Code)
	}
}

func TestChaos_RedisOutageFailOpenUnderConcurrency(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{
		Addr:         mr.Addr(),
		MaxRetries:   0,
		DialTimeout:  100 * time.Millisecond,
		ReadTimeout:  100 * time.Millisecond,
		WriteTimeout: 100 * time.Millisecond,
	})
	defer func() { _ = rc.Close() }()

	r := newRouter(RouterDeps{
		Redis: rc,
	})

	// Coupure brutale de Redis pendant une rafale concurrente : l'API doit rester
	// disponible en fail-open sans panique ni race condition.
	mr.Close()

	var wg sync.WaitGroup
	errs := make(chan int, 24)
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
			req.RemoteAddr = "203.0.113.99:4321"
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				errs <- w.Code
			}
		}()
	}
	wg.Wait()
	close(errs)
	for code := range errs {
		t.Fatalf("fail-open attendu (200) pendant la panne Redis, obtenu %d", code)
	}
}

func TestReadinessProbe_DrainingReturns503(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rc.Close() }()

	ready := &atomic.Bool{}
	ready.Store(true)
	r := newRouter(RouterDeps{
		Redis: rc,
		Ready: ready,
	})

	wLive := httptest.NewRecorder()
	r.ServeHTTP(wLive, httptest.NewRequest(http.MethodGet, "/livez", nil))
	if wLive.Code != http.StatusOK {
		t.Fatalf("GET /livez = %d", wLive.Code)
	}

	wReady := httptest.NewRecorder()
	r.ServeHTTP(wReady, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if wReady.Code != http.StatusOK {
		t.Fatalf("GET /readyz = %d, attendu 200", wReady.Code)
	}

	// Bascule en draining -> /readyz doit répondre 503 immédiatement, /livez reste 200.
	ready.Store(false)
	wDrain := httptest.NewRecorder()
	r.ServeHTTP(wDrain, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if wDrain.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /readyz pendant drain = %d, attendu 503", wDrain.Code)
	}
}
