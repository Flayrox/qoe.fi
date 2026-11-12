package users

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

type okRow struct{}

func (okRow) Scan(dest ...any) error { return pgx.ErrNoRows }

type okPool struct{}

func (okPool) Begin(ctx context.Context) (pgx.Tx, error) {
	return nil, errors.New("unexpected Begin")
}
func (okPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return pgconn.NewCommandTag("UPDATE 1"), nil
}
func (okPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}
func (okPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return okRow{}
}

func TestUpdateProfilePatch_RejectsUnsafeLogoURL(t *testing.T) {
	svc := &Service{pool: okPool{}}
	r := chi.NewRouter()
	NewHandler(svc).Register(r)

	userID := "00000000-0000-0000-0000-000000000401"
	unsafeURLs := []string{
		"javascript:alert(1)",
		"vbscript:msgbox(1)",
		"data:text/html,<script>alert(1)</script>",
	}

	for _, rawURL := range unsafeURLs {
		_, err := svc.UpdateProfilePatch(context.Background(), userID, ProfilePatchParams{
			LogoURL: &rawURL,
		})
		var rej *antispam.RejectionError
		if !errors.As(err, &rej) || rej.Code != antispam.CodeUnsafeURL {
			t.Fatalf("UpdateProfilePatch(%q) err=%v, attendu RejectionError(%s)", rawURL, err, antispam.CodeUnsafeURL)
		}

		req := httptest.NewRequest(http.MethodPatch, "/v1/me/profile", strings.NewReader(`{"logoUrl":"`+rawURL+`"}`))
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("PATCH /v1/me/profile(%q) = %d %s, attendu 400", rawURL, w.Code, w.Body.String())
		}
	}
}

func TestTrustInvalidation_PhoneAndOnboarding(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	userID := "00000000-0000-0000-0000-000000000402"
	svc := &Service{pool: okPool{}}
	svc.SetTrustService(trust.NewService(nil, rc))

	ctx := context.Background()

	mr.Set("sec:trust:"+userID, `{"phoneVerified":false}`)
	if err := svc.MarkPhoneVerified(ctx, userID, "+33600000000", time.Now()); err != nil {
		t.Fatalf("MarkPhoneVerified: %v", err)
	}
	if mr.Exists("sec:trust:" + userID) {
		t.Fatal("MarkPhoneVerified doit invalider sec:trust:<userID>")
	}

	mr.Set("sec:trust:"+userID, `{"phoneVerified":true}`)
	if err := svc.ClearPhoneVerification(ctx, userID); err != nil {
		t.Fatalf("ClearPhoneVerification: %v", err)
	}
	if mr.Exists("sec:trust:" + userID) {
		t.Fatal("ClearPhoneVerification doit invalider sec:trust:<userID>")
	}

	mr.Set("sec:trust:"+userID, `{"onboardingDone":false}`)
	if err := svc.OnboardingComplete(ctx, userID, OnboardingCompleteInput{}); err != nil {
		t.Fatalf("OnboardingComplete: %v", err)
	}
	if mr.Exists("sec:trust:" + userID) {
		t.Fatal("OnboardingComplete doit invalider sec:trust:<userID>")
	}
}
