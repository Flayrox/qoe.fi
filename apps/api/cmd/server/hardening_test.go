package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestCorsAllowedOrigins_DevOnlyGating(t *testing.T) {
	prod := corsAllowedOrigins(false)
	for _, o := range prod {
		if strings.Contains(o, "localhost") || strings.Contains(o, ".test") {
			t.Fatalf("origine dev interdite en prod : %s", o)
		}
	}
	if !slices.Contains(prod, "https://qoe.fi") {
		t.Fatal("https://qoe.fi requis en prod")
	}

	dev := corsAllowedOrigins(true)
	if !slices.Contains(dev, "http://localhost:3000") || !slices.Contains(dev, "https://*.qoe.test") {
		t.Fatalf("origines dev attendues quand DevtoolsDevOnly=true : %v", dev)
	}
}

func TestBodyLimitForPath_PreservesMediaAndEbooks(t *testing.T) {
	if got := bodyLimitForPath("/v1/posts"); got != defaultBodyLimitBytes {
		t.Fatalf("/v1/posts = %d, attendu %d", got, defaultBodyLimitBytes)
	}
	if got := bodyLimitForPath("/v1/articles"); got != richBodyLimitBytes {
		t.Fatalf("/v1/articles = %d, attendu %d", got, richBodyLimitBytes)
	}
	if got := bodyLimitForPath("/v1/creator/media"); got != mediaBodyLimitBytes {
		t.Fatalf("/v1/creator/media = %d, attendu %d", got, mediaBodyLimitBytes)
	}
	if got := bodyLimitForPath("/v1/me/ebooks"); got != ebookBodyLimitBytes {
		t.Fatalf("/v1/me/ebooks = %d, attendu %d", got, ebookBodyLimitBytes)
	}

	h := routeAwareMaxBodyBytes()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	// > 256 Ko sur /v1/posts → rejeté (413)
	bigPost := strings.NewReader(strings.Repeat("a", int(defaultBodyLimitBytes)+1024))
	req := httptest.NewRequest(http.MethodPost, "/v1/posts", bigPost)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("attendu 413 sur /v1/posts, obtenu %d", w.Code)
	}

	// 1 Mo sur /v1/me/ebooks → accepté (plafond 22 Mo)
	okEbook := strings.NewReader(strings.Repeat("b", 1<<20))
	req2 := httptest.NewRequest(http.MethodPost, "/v1/me/ebooks", okEbook)
	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("attendu 200 pour 1 Mo sur /v1/me/ebooks, obtenu %d", w2.Code)
	}
}

func TestProtectedRouteRateLimit_MFATOTPVerify(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rc.Close() }()

	h := protectedRouteRateLimit(rc)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/me/mfa/totp/verify", nil)
		req.RemoteAddr = "198.51.100.10:1234"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("tentative %d/5 aurait dû passer, obtenu %d", i+1, w.Code)
		}
	}

	req6 := httptest.NewRequest(http.MethodPost, "/v1/me/mfa/totp/verify", nil)
	req6.RemoteAddr = "198.51.100.10:1234"
	w6 := httptest.NewRecorder()
	h.ServeHTTP(w6, req6)
	if w6.Code != http.StatusTooManyRequests {
		t.Fatalf("6e tentative MFA aurait dû être bloquée en 429, obtenu %d", w6.Code)
	}
}

func TestNewRouter_HardeningEndToEnd(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer func() { _ = rc.Close() }()

	prodRouter := newRouter(RouterDeps{
		Redis:           rc,
		DevtoolsDevOnly: false,
	})

	// 1. SecurityHeaders sur une route réelle du routeur assemblé.
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	prodRouter.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /healthz = %d", w.Code)
	}
	if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, attendu nosniff", got)
	}
	if got := w.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("X-Frame-Options = %q, attendu DENY", got)
	}

	// 2. CORS : localhost rejeté en prod, autorisé quand DevtoolsDevOnly=true.
	preflight := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	preflight.Header.Set("Origin", "http://localhost:3000")
	pw := httptest.NewRecorder()
	prodRouter.ServeHTTP(pw, preflight)
	if got := pw.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("localhost CORS interdit en prod, obtenu %q", got)
	}

	devRouter := newRouter(RouterDeps{
		Redis:           rc,
		DevtoolsDevOnly: true,
	})
	pwDev := httptest.NewRecorder()
	devRouter.ServeHTTP(pwDev, preflight.Clone(t.Context()))
	if got := pwDev.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("localhost CORS attendu en dev, obtenu %q", got)
	}

	// 3. Corps JSON > 256 Ko sur route standard (/v1/tracking/reading-session)
	// et > 2 Mo sur route riche (/v1/support/public/tickets) rejetés en 413 JSON.
	oversizedDefault := `{"articleId":"a","sessionId":"` + strings.Repeat("a", int(defaultBodyLimitBytes)+1024) + `"}`
	reqBig := httptest.NewRequest(http.MethodPost, "/v1/tracking/reading-session", strings.NewReader(oversizedDefault))
	reqBig.Header.Set("Content-Type", "application/json")
	bw := httptest.NewRecorder()
	prodRouter.ServeHTTP(bw, reqBig)
	if bw.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("attendu 413 sur POST /v1/tracking/reading-session >256 Ko, obtenu %d (body=%s)", bw.Code, bw.Body.String())
	}
	if !strings.Contains(bw.Body.String(), `"error"`) {
		t.Fatalf("réponse 413 attendue en JSON {\"error\":...}, obtenu %s", bw.Body.String())
	}

	oversizedRich := `{"kind":"account","subject":"x","message":"` + strings.Repeat("a", int(richBodyLimitBytes)+1024) + `"}`
	reqRichBig := httptest.NewRequest(http.MethodPost, "/v1/support/public/tickets", strings.NewReader(oversizedRich))
	reqRichBig.Header.Set("Content-Type", "application/json")
	bwRich := httptest.NewRecorder()
	prodRouter.ServeHTTP(bwRich, reqRichBig)
	if bwRich.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("attendu 413 sur POST /v1/support/public/tickets >2 Mo, obtenu %d (body=%s)", bwRich.Code, bwRich.Body.String())
	}
}
