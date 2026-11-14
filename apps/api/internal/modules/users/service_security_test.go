package users

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/qoefi/api/internal/middleware"
)

func TestMaskIPSubnet(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"198.51.100.42", "198.51.100.0/24"},
		{"198.51.100.42:54321", "198.51.100.0/24"},
		{"203.0.113.9, 10.0.0.1", "203.0.113.0/24"},
		{"2001:db8:85a3:1:2:3:4:5", "2001:db8:85a3::/48"},
		{"not-an-ip", ""},
		{"", ""},
	}
	for _, tc := range cases {
		if got := maskIPSubnet(tc.in); got != tc.want {
			t.Errorf("maskIPSubnet(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSecurityHelpers_NilPool(t *testing.T) {
	svc := &Service{}
	svc.SetAsynqClient(nil)
	ctx := context.Background()

	svc.RecordSecurityEvent(ctx, "00000000-0000-0000-0000-000000000001", "", "password_changed", "", "", nil, true)

	events, err := svc.ListSecurityEvents(ctx, "00000000-0000-0000-0000-000000000001")
	if err != nil {
		t.Fatalf("ListSecurityEvents(nil pool): %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}

	isNew, err := svc.CheckLoginEnvironment(ctx, "00000000-0000-0000-0000-000000000001", "198.51.100.1", "UA")
	if err != nil {
		t.Fatalf("CheckLoginEnvironment(nil pool): %v", err)
	}
	if isNew {
		t.Fatal("expected false on nil pool")
	}
}

func TestSecurityHandlers_AuthAndNilPool(t *testing.T) {
	h := NewHandler(&Service{})

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		for _, fn := range []http.HandlerFunc{h.securityEvents, h.securityLoginCheck} {
			req := httptest.NewRequest(http.MethodGet, "/v1/me/security-events", nil)
			rec := httptest.NewRecorder()
			fn(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("code=%d, want 401", rec.Code)
			}
		}
	})

	t.Run("authenticated with nil pool returns 200", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), middleware.UserIDKey, "00000000-0000-0000-0000-000000000001")

		req1 := httptest.NewRequest(http.MethodGet, "/v1/me/security-events", nil).WithContext(ctx)
		rec1 := httptest.NewRecorder()
		h.securityEvents(rec1, req1)
		if rec1.Code != http.StatusOK {
			t.Fatalf("securityEvents code=%d, want 200", rec1.Code)
		}

		req2 := httptest.NewRequest(http.MethodPost, "/v1/me/security-login-check", nil).WithContext(ctx)
		req2.Header.Set("X-Forwarded-For", "198.51.100.77")
		req2.Header.Set("User-Agent", "TestBrowser/1.0")
		rec2 := httptest.NewRecorder()
		h.securityLoginCheck(rec2, req2)
		if rec2.Code != http.StatusOK {
			t.Fatalf("securityLoginCheck code=%d, want 200", rec2.Code)
		}
	})
}
