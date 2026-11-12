package middleware

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestSecurityHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := SecurityHeaders(inner)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/health", nil))

	expected := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
		"Permissions-Policy":     "camera=(), microphone=(), geolocation=()",
	}
	for k, want := range expected {
		if got := rr.Header().Get(k); got != want {
			t.Errorf("header %s = %q, attendu %q", k, got, want)
		}
	}
}

func TestCORS_AllowAndExposeHeaders(t *testing.T) {
	h := CORS([]string{"https://qoe.fi"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/v1/articles", nil)
	req.Header.Set("Origin", "https://qoe.fi")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS status = %d, attendu 204", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "https://qoe.fi" {
		t.Errorf("Allow-Origin = %q, attendu https://qoe.fi", got)
	}
	allowHeaders := rr.Header().Get("Access-Control-Allow-Headers")
	for _, want := range []string{"Authorization", "Content-Type", "X-Qoe-Signature", "X-Qoe-Challenge", "X-Request-Id", "Idempotency-Key"} {
		if !strings.Contains(allowHeaders, want) {
			t.Errorf("Access-Control-Allow-Headers = %q, manque %q", allowHeaders, want)
		}
	}
	exposeHeaders := rr.Header().Get("Access-Control-Expose-Headers")
	for _, want := range []string{"X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After", "X-Request-Id"} {
		if !strings.Contains(exposeHeaders, want) {
			t.Errorf("Access-Control-Expose-Headers = %q, manque %q", exposeHeaders, want)
		}
	}
}

func TestRequestID_GenerateSanitizeAndPropagate(t *testing.T) {
	var seenCtx string
	h := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCtx = GetRequestID(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	// 1. Pas d'en-tête → génère 24 chars hex + propage dans header et contexte.
	rr1 := httptest.NewRecorder()
	h.ServeHTTP(rr1, httptest.NewRequest(http.MethodGet, "/v1/health", nil))
	if len(seenCtx) != 24 || rr1.Header().Get("X-Request-Id") != seenCtx {
		t.Fatalf("RequestID généré invalide: ctx=%q hdr=%q", seenCtx, rr1.Header().Get("X-Request-Id"))
	}

	// 2. En-tête valide → conservé tel quel.
	req2 := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req2.Header.Set("X-Request-Id", "trace_abc-123")
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if seenCtx != "trace_abc-123" || rr2.Header().Get("X-Request-Id") != "trace_abc-123" {
		t.Fatalf("RequestID valide non propagé: ctx=%q", seenCtx)
	}

	// 3. En-tête injecté/malveillant → rejeté et régénéré.
	req3 := httptest.NewRequest(http.MethodGet, "/v1/health", nil)
	req3.Header.Set("X-Request-Id", "bad\r\nheader value")
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if seenCtx == "" || strings.ContainsAny(seenCtx, "\r\n ") {
		t.Fatalf("RequestID malveillant non sanitisé: %q", seenCtx)
	}
}

func TestMaxBodyBytes_And_IsBodyTooLarge(t *testing.T) {
	readHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			if IsBodyTooLarge(err) {
				w.WriteHeader(http.StatusRequestEntityTooLarge)
				return
			}
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	h := MaxBodyBytes(16)(readHandler)

	// POST sous la limite → 200.
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch} {
		req := httptest.NewRequest(method, "/", strings.NewReader("0123456789abcdef"))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("%s sous limite = %d, attendu 200", method, rr.Code)
		}
	}

	// POST/PUT/PATCH au-dessus de la limite → MaxBytesError détecté par IsBodyTooLarge → 413.
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch} {
		req := httptest.NewRequest(method, "/", strings.NewReader("0123456789abcdefX"))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("%s au-dessus de la limite = %d, attendu 413", method, rr.Code)
		}
	}

	// GET/DELETE ne sont pas plafonnés par MaxBodyBytes.
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		req := httptest.NewRequest(method, "/", strings.NewReader(strings.Repeat("a", 64)))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("%s ne doit pas être plafonné, got %d", method, rr.Code)
		}
	}

	// IsBodyTooLarge sur une autre erreur → false.
	if IsBodyTooLarge(errors.New("autre erreur")) {
		t.Error("IsBodyTooLarge doit retourner false pour une erreur non MaxBytesError")
	}
	if IsBodyTooLarge(nil) {
		t.Error("IsBodyTooLarge(nil) doit retourner false")
	}
}

func TestClampLimit(t *testing.T) {
	cases := []struct {
		raw          string
		defaultLimit int
		maxLimit     int
		want         int
	}{
		{"", 20, 100, 20},
		{"abc", 20, 100, 20},
		{"0", 20, 100, 20},
		{"-5", 20, 100, 20},
		{"1", 20, 100, 1},
		{"42", 20, 100, 42},
		{" 50 ", 20, 100, 50},
		{"100", 20, 100, 100},
		{"999", 20, 100, 100},
	}
	for _, tc := range cases {
		if got := ClampLimit(tc.raw, tc.defaultLimit, tc.maxLimit); got != tc.want {
			t.Errorf("ClampLimit(%q, %d, %d) = %d, attendu %d", tc.raw, tc.defaultLimit, tc.maxLimit, got, tc.want)
		}
	}
}

func TestClientSubnet(t *testing.T) {
	cases := []struct {
		name string
		xff  string
		want string
	}{
		{"ipv4", "192.168.10.42", "192.168.10.0/24"},
		{"ipv4-mapped-ipv6", "::ffff:203.0.113.77", "203.0.113.0/24"},
		{"ipv6", "2001:db8:85a3:1:2:3:4:5", "2001:db8:85a3:1::/64"},
		{"ipv6-zone", "fe80::1234:5678:9abc:def0%eth0", "fe80::/64"},
		{"invalid", "not-an-ip", "not-an-ip"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("X-Forwarded-For", tc.xff)
			if got := ClientSubnet(req); got != tc.want {
				t.Errorf("ClientSubnet(%q) = %q, attendu %q", tc.xff, got, tc.want)
			}
		})
	}
}

func TestGCRA_NoDoubleBurstAcrossMinuteBoundary_AndHeaders(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	// Départ à t = 59s d'une minute (juste avant la frontière de minute).
	t0 := time.Date(2026, 11, 12, 12, 0, 59, 0, time.UTC)
	s.SetTime(t0)

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := RateLimit("gcra-boundary", rc, time.Minute, 5, false)(inner)

	doReq := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", "198.51.100.9")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr
	}

	// Burst initial de 5 requêtes à t = 59s : toutes passent avec Remaining décrémentant 4..0.
	for i := 0; i < 5; i++ {
		rr := doReq()
		if rr.Code != http.StatusOK {
			t.Fatalf("requête %d = %d, attendu 200", i+1, rr.Code)
		}
		if got := rr.Header().Get("X-RateLimit-Limit"); got != "5" {
			t.Errorf("X-RateLimit-Limit = %q, attendu 5", got)
		}
		if got := rr.Header().Get("X-RateLimit-Remaining"); got != strconv.Itoa(4-i) {
			t.Errorf("req %d X-RateLimit-Remaining = %q, attendu %d", i+1, got, 4-i)
		}
		if reset := rr.Header().Get("X-RateLimit-Reset"); reset == "" {
			t.Errorf("req %d X-RateLimit-Reset absent", i+1)
		}
	}

	// 2 secondes plus tard (t = 12:01:01 — nouvelle minute !) : aucune fenêtre fixe
	// ne réinitialise le quota, donc pas de double-burst → 429 avec Retry-After.
	s.SetTime(t0.Add(2 * time.Second))
	rrBlocked := doReq()
	if rrBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("double-burst franchi à t+2s : status = %d, attendu 429", rrBlocked.Code)
	}
	if rrBlocked.Header().Get("X-RateLimit-Limit") != "5" {
		t.Errorf("429 X-RateLimit-Limit = %q, attendu 5", rrBlocked.Header().Get("X-RateLimit-Limit"))
	}
	if rrBlocked.Header().Get("X-RateLimit-Remaining") != "0" {
		t.Errorf("429 X-RateLimit-Remaining = %q, attendu 0", rrBlocked.Header().Get("X-RateLimit-Remaining"))
	}
	if rrBlocked.Header().Get("X-RateLimit-Reset") == "" {
		t.Error("429 X-RateLimit-Reset absent")
	}
	retryAfter, err := strconv.Atoi(rrBlocked.Header().Get("Retry-After"))
	if err != nil || retryAfter < 1 {
		t.Errorf("429 Retry-After invalide = %q (err=%v)", rrBlocked.Header().Get("Retry-After"), err)
	}
	if !strings.Contains(rrBlocked.Body.String(), "Trop de requêtes. Réessayez dans un instant.") {
		t.Errorf("429 body inattendu = %q", rrBlocked.Body.String())
	}

	// Intervalle d'émission = 60s / 5 = 12s : à t0 + 12s exactement, 1 jeton se régénère.
	s.SetTime(t0.Add(12 * time.Second))
	if rr := doReq(); rr.Code != http.StatusOK {
		t.Fatalf("à t0+12s un jeton doit être régénéré, got %d", rr.Code)
	}
	if rr := doReq(); rr.Code != http.StatusTooManyRequests {
		t.Fatalf("deuxième requête à t0+12s doit donner 429, got %d", rr.Code)
	}
}

func TestRateLimitDual_UserAndSubnetBuckets(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	s.SetTime(time.Date(2026, 11, 12, 14, 0, 0, 0, time.UTC))

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	// Limite user = 5/min, limite sous-réseau = 2/min.
	h := RateLimitDual("dual", rc, time.Minute, 5, time.Minute, 2)(inner)

	send := func(uid, ip string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/subscribe", nil)
		req.Header.Set("X-Forwarded-For", ip)
		if uid != "" {
			req = req.WithContext(context.WithValue(req.Context(), UserIDKey, uid))
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr
	}

	// 1. IPv4 /24 : 2 utilisateurs différents consomment la limite sous-réseau (2), le 3e bloque.
	if code := send("u1", "203.0.113.10").Code; code != http.StatusOK {
		t.Fatalf("u1 sur /24 = %d, attendu 200", code)
	}
	if code := send("u2", "203.0.113.42").Code; code != http.StatusOK {
		t.Fatalf("u2 sur /24 = %d, attendu 200", code)
	}
	rr3 := send("u3", "203.0.113.99")
	if rr3.Code != http.StatusTooManyRequests {
		t.Fatalf("u3 sur même /24 doit bloquer en 429, got %d", rr3.Code)
	}
	if rr3.Header().Get("Retry-After") == "" {
		t.Error("429 RateLimitDual sans Retry-After")
	}

	// 2. IPv6 /64 : 2 utilisateurs différents sur le même /64 consomment la limite, le 3e bloque.
	if code := send("v1", "2001:db8:aaaa:bbbb::1").Code; code != http.StatusOK {
		t.Fatalf("v1 sur /64 = %d, attendu 200", code)
	}
	if code := send("v2", "2001:db8:aaaa:bbbb:1234::9").Code; code != http.StatusOK {
		t.Fatalf("v2 sur /64 = %d, attendu 200", code)
	}
	if code := send("v3", "2001:db8:aaaa:bbbb:ffff::1").Code; code != http.StatusTooManyRequests {
		t.Fatalf("v3 sur même /64 doit bloquer en 429, got %d", code)
	}

	// 3. Limite utilisateur déclenche même depuis des sous-réseaux distincts (userMax=2, subnetMax=10).
	hUserTight := RateLimitDual("dual-user", rc, time.Minute, 2, time.Minute, 10)(inner)
	sendTight := func(uid, ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.Header.Set("X-Forwarded-For", ip)
		req = req.WithContext(context.WithValue(req.Context(), UserIDKey, uid))
		rr := httptest.NewRecorder()
		hUserTight.ServeHTTP(rr, req)
		return rr.Code
	}
	if code := sendTight("mobile-user", "10.1.0.1"); code != http.StatusOK {
		t.Fatalf("req 1 = %d", code)
	}
	if code := sendTight("mobile-user", "10.2.0.1"); code != http.StatusOK {
		t.Fatalf("req 2 = %d", code)
	}
	if code := sendTight("mobile-user", "10.3.0.1"); code != http.StatusTooManyRequests {
		t.Fatalf("req 3 même user sur autre /24 doit donner 429, got %d", code)
	}
}

func TestCheckGCRA_MultiWindow(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	ctx := context.Background()
	t0 := time.Date(2026, 11, 12, 15, 0, 0, 0, time.UTC)
	s.SetTime(t0)

	// Redis nil → autorisé.
	if ok, retry, err := CheckGCRA(ctx, nil, "k", time.Minute, 1); err != nil || !ok || retry != 0 {
		t.Fatalf("nil redis: ok=%v retry=%d err=%v", ok, retry, err)
	}

	// Fenêtre minute (2) + fenêtre heure (3) sur la même identité.
	checkBoth := func() (bool, int) {
		okMin, retryMin, err := CheckGCRA(ctx, rc, "dyn:u1:1m", time.Minute, 2)
		if err != nil {
			t.Fatalf("CheckGCRA 1m err: %v", err)
		}
		if !okMin {
			return false, retryMin
		}
		okHr, retryHr, err := CheckGCRA(ctx, rc, "dyn:u1:1h", time.Hour, 3)
		if err != nil {
			t.Fatalf("CheckGCRA 1h err: %v", err)
		}
		return okHr, retryHr
	}

	// 2 premières requêtes passent (consomment 2/2 minute, 2/3 heure).
	if ok, _ := checkBoth(); !ok {
		t.Fatal("req 1 doit passer")
	}
	if ok, _ := checkBoth(); !ok {
		t.Fatal("req 2 doit passer")
	}
	// 3e à t0 bloquée par la fenêtre minute.
	if ok, retry := checkBoth(); ok || retry < 1 {
		t.Fatalf("req 3 doit être bloquée par 1m, ok=%v retry=%d", ok, retry)
	}

	// +1 minute : fenêtre 1m rechargée, 3e requête passe (consomme 3/3 heure).
	s.SetTime(t0.Add(time.Minute))
	if ok, _ := checkBoth(); !ok {
		t.Fatal("req à t0+1m doit passer")
	}

	// +2 minutes : fenêtre 1m a du crédit, mais la fenêtre 1h (max 3) bloque encore.
	s.SetTime(t0.Add(2 * time.Minute))
	if ok, retry := checkBoth(); ok || retry < 1 {
		t.Fatalf("req à t0+2m doit être bloquée par 1h, ok=%v retry=%d", ok, retry)
	}
}

func TestRateLimit_FailOpenWithThrottledLog(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	// Simuler une erreur runtime Redis et réinitialiser l'état du throttle de log.
	s.SetError("ERR simulated redis failure")
	lastRateLimitWarnUnixNano.Store(0)

	var logBuf bytes.Buffer
	prevOut := log.Writer()
	log.SetOutput(&logBuf)
	defer log.SetOutput(prevOut)

	h := RateLimit("failopen", rc, time.Minute, 1, false)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// 5 requêtes consécutives en erreur Redis doivent toutes passer (fail-open)
	// et n'émettre qu'un seul warning dans la fenêtre de 30s.
	for i := 0; i < 5; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("req %d en erreur Redis = %d, attendu 200 (fail-open)", i+1, rr.Code)
		}
	}

	lines := strings.Count(logBuf.String(), "[ratelimit]")
	if lines != 1 {
		t.Errorf("nombre de logs fail-open = %d, attendu 1 (throttled 30s); log=%q", lines, logBuf.String())
	}
}
