package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAuthRejectsUnexpectedHSAlgorithm(t *testing.T) {
	auth := NewAuth("router-test-secret-0123456789", "")
	token := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{
		"sub": "user-1",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	raw, err := token.SignedString([]byte("router-test-secret-0123456789"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	rec := httptest.NewRecorder()
	auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("HS512 token accepted with HS256 secret: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAuthRejectsMalformedBearer(t *testing.T) {
	auth := NewAuth("router-test-secret-0123456789", "")
	for _, header := range []string{"Bearer", "Basic token", "Bearer ", "Bearer not-a-jwt"} {
		t.Run(header, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Authorization", header)
			rec := httptest.NewRecorder()
			auth.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})).ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("header %q accepted: status=%d", header, rec.Code)
			}
		})
	}
}

func TestCORSWildcardOrigin(t *testing.T) {
	handler := CORS([]string{"https://qoe.fi", "https://*.qoe.fi"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	allowed := httptest.NewRequest(http.MethodGet, "/", nil)
	allowed.Header.Set("Origin", "https://studio.qoe.fi")
	allowedRec := httptest.NewRecorder()
	handler.ServeHTTP(allowedRec, allowed)
	if got := allowedRec.Header().Get("Access-Control-Allow-Origin"); got != "https://studio.qoe.fi" {
		t.Fatalf("allowed wildcard origin = %q", got)
	}

	for _, origin := range []string{"https://evil.example", "https://qoe.fi.evil.example", "https://a.b.qoe.fi"} {
		t.Run(origin, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Origin", origin)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
				t.Fatalf("origin %q unexpectedly allowed as %q", origin, got)
			}
		})
	}
}

func TestRecoveryReturnsJSON500(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	Recovery(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})).ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("recovery status=%d", rec.Code)
	}
	if rec.Header().Get("Content-Type") == "" || rec.Body.String() == "" {
		t.Fatalf("recovery response incomplete: headers=%v body=%s", rec.Header(), rec.Body.String())
	}
}
