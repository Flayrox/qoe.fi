package creator

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/antispam"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/secguard"
	"github.com/redis/go-redis/v9"
)

type stubFollowQuerier struct {
	*db.Queries
	pubID     string
	ownerID   string
	following bool
}

func (s *stubFollowQuerier) GetPublisherBySlugOrSubdomain(ctx context.Context, lower string) (db.GetPublisherBySlugOrSubdomainRow, error) {
	return db.GetPublisherBySlugOrSubdomainRow{ID: s.pubID}, nil
}

func (s *stubFollowQuerier) GetPublisherOwner(ctx context.Context, id string) (string, error) {
	return s.ownerID, nil
}

func (s *stubFollowQuerier) GetUserProfileVisibility(ctx context.Context, id string) (string, error) {
	return "PUBLIC", nil
}

func (s *stubFollowQuerier) IsBlockedEitherWay(ctx context.Context, arg db.IsBlockedEitherWayParams) (bool, error) {
	return false, nil
}

func (s *stubFollowQuerier) GetExistingFollow(ctx context.Context, arg db.GetExistingFollowParams) (int32, error) {
	if s.following {
		return 1, nil
	}
	return 0, pgx.ErrNoRows
}

func (s *stubFollowQuerier) GetExistingFollowRequest(ctx context.Context, arg db.GetExistingFollowRequestParams) (int32, error) {
	return 0, pgx.ErrNoRows
}

func (s *stubFollowQuerier) InsertFollow(ctx context.Context, arg db.InsertFollowParams) error {
	s.following = true
	return nil
}

func (s *stubFollowQuerier) DeleteFollow(ctx context.Context, arg db.DeleteFollowParams) error {
	s.following = false
	return nil
}

func (s *stubFollowQuerier) DeleteFollowRequest(ctx context.Context, arg db.DeleteFollowRequestParams) error {
	return nil
}

func (s *stubFollowQuerier) CancelFollowRequest(ctx context.Context, arg db.CancelFollowRequestParams) error {
	return nil
}

func (s *stubFollowQuerier) DeleteFollowNotification(ctx context.Context, arg db.DeleteFollowNotificationParams) error {
	return nil
}

func (s *stubFollowQuerier) GetFollowPrefs(ctx context.Context, userid pgtype.UUID) (db.GetFollowPrefsRow, error) {
	return db.GetFollowPrefsRow{EmailFollows: false, PushFollows: false}, nil
}

func (s *stubFollowQuerier) CountFollowers(ctx context.Context, publicationid string) (int32, error) {
	if s.following {
		return 1, nil
	}
	return 0, nil
}

func (s *stubFollowQuerier) AcceptFollowRequest(ctx context.Context, id string) error {
	return nil
}

func (s *stubFollowQuerier) DeleteFollowRequestNotification(ctx context.Context, arg db.DeleteFollowRequestNotificationParams) error {
	return nil
}

func (s *stubFollowQuerier) GetMediaMemberContext(ctx context.Context, arg db.GetMediaMemberContextParams) (db.GetMediaMemberContextRow, error) {
	return db.GetMediaMemberContextRow{}, pgx.ErrNoRows
}

type stubFollowRow struct {
	vals []any
	err  error
}

func (r stubFollowRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(r.vals) != len(dest) {
		return errors.New("unexpected scan column count")
	}
	for i := range dest {
		switch d := dest[i].(type) {
		case *string:
			*d = r.vals[i].(string)
		case *pgtype.Text:
			*d = pgtype.Text{String: r.vals[i].(string), Valid: true}
		}
	}
	return nil
}

type stubFollowPool struct {
	requesterID string
	pubID       string
}

func (p *stubFollowPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return pgconn.NewCommandTag("OK 1"), nil
}

func (p *stubFollowPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (p *stubFollowPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if p.requesterID != "" && p.pubID != "" {
		return stubFollowRow{vals: []any{p.requesterID, p.pubID}}
	}
	return stubFollowRow{err: pgx.ErrNoRows}
}

func TestFollowToggle_RateLimitChurnAndTrustInvalidation(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	actorID := "00000000-0000-0000-0000-000000000101"
	ownerID := "00000000-0000-0000-0000-000000000202"
	pubID := "pub-bob"

	sq := &stubFollowQuerier{pubID: pubID, ownerID: ownerID}
	h := (&Handler{pool: &stubFollowPool{}, q: sq}).SetSecurityGuard(secguard.New(nil, rc))

	r := chi.NewRouter()
	h.RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	// Pré-peuple le cache Trust pour vérifier l'invalidation temps réel des deux comptes.
	mr.Set("sec:trust:"+actorID, `{"phoneVerified":false}`)
	mr.Set("sec:trust:"+ownerID, `{"phoneVerified":true}`)

	// 1er appel : follow -> 200, churn=1, caches Trust invalidés.
	req := httptest.NewRequest(http.MethodPost, "/v1/users/bob/follow", nil)
	req.RemoteAddr = "198.51.100.10:1234"
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, actorID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("1er follow = %d %s, attendu 200", w.Code, w.Body.String())
	}
	if mr.Exists("sec:trust:"+actorID) || mr.Exists("sec:trust:"+ownerID) {
		t.Fatalf("les caches Trust n'ont pas été invalidés après follow")
	}
	churnVal, err := mr.Get("sec:follow:churn:" + actorID)
	if err != nil || churnVal != "1" {
		t.Fatalf("churn = %q (%v), attendu 1", churnVal, err)
	}

	// Tier Low (non vérifié sans pool) => 10 follows/h max ; les 9 suivants passent, le 11e -> 429.
	for i := 2; i <= 10; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/users/bob/follow", nil)
		req.RemoteAddr = "198.51.100.10:1234"
		req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, actorID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("requête %d = %d %s, attendu 200", i, w.Code, w.Body.String())
		}
	}

	reqOver := httptest.NewRequest(http.MethodPost, "/v1/users/bob/follow", nil)
	reqOver.RemoteAddr = "198.51.100.10:1234"
	reqOver = reqOver.WithContext(context.WithValue(reqOver.Context(), middleware.UserIDKey, actorID))
	wOver := httptest.NewRecorder()
	r.ServeHTTP(wOver, reqOver)
	if wOver.Code != http.StatusTooManyRequests {
		t.Fatalf("11e requête = %d %s, attendu 429", wOver.Code, wOver.Body.String())
	}
	if wOver.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After manquant sur la réponse 429")
	}
	if body := wOver.Body.String(); body == "" || !containsCode(body, antispam.CodeWriteCooldown) {
		t.Fatalf("code machine attendu %s dans %s", antispam.CodeWriteCooldown, body)
	}
}

func TestAcceptFollowRequestAndRemoveFollower_InvalidateTrust(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	ownerID := "00000000-0000-0000-0000-000000000301"
	requesterID := "00000000-0000-0000-0000-000000000302"
	pubID := "pub-owner"

	sq := &stubFollowQuerier{pubID: pubID, ownerID: ownerID}
	fp := &stubFollowPool{requesterID: requesterID, pubID: pubID}
	h := (&Handler{pool: fp, q: sq}).SetSecurityGuard(secguard.New(nil, rc))

	r := chi.NewRouter()
	h.RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})

	mr.Set("sec:trust:"+ownerID, `{"phoneVerified":true}`)
	mr.Set("sec:trust:"+requesterID, `{"phoneVerified":true}`)

	req := httptest.NewRequest(http.MethodPost, "/v1/me/follow-requests/req-1/accept", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, ownerID))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("acceptFollowRequest = %d %s, attendu 200", w.Code, w.Body.String())
	}
	if mr.Exists("sec:trust:"+ownerID) || mr.Exists("sec:trust:"+requesterID) {
		t.Fatal("acceptFollowRequest doit invalider les caches Trust de l'owner et du demandeur")
	}

	mr.Set("sec:trust:"+ownerID, `{"phoneVerified":true}`)
	mr.Set("sec:trust:"+requesterID, `{"phoneVerified":true}`)

	reqRem := httptest.NewRequest(http.MethodDelete, "/v1/me/followers/"+requesterID, nil)
	ctx := context.WithValue(reqRem.Context(), middleware.UserIDKey, ownerID)
	ctx = context.WithValue(ctx, middleware.PublisherIDKey, pubID)
	reqRem = reqRem.WithContext(ctx)
	wRem := httptest.NewRecorder()
	r.ServeHTTP(wRem, reqRem)
	if wRem.Code != http.StatusOK {
		t.Fatalf("removeFollower = %d %s, attendu 200", wRem.Code, wRem.Body.String())
	}
	if mr.Exists("sec:trust:"+ownerID) || mr.Exists("sec:trust:"+requesterID) {
		t.Fatal("removeFollower doit invalider les caches Trust de l'owner et du follower retiré")
	}
}

func TestPaginationClamping(t *testing.T) {
	reqHigh := httptest.NewRequest(http.MethodGet, "/v1/users/alice/followers?limit=9999&cursor=-5", nil)
	if got, off := parseFollowPage(reqHigh); got != 100 || off != 0 {
		t.Fatalf("parseFollowPage(9999, -5) = (%d, %d), attendu (100, 0)", got, off)
	}
	if got, off := parseLimitCursor(reqHigh); got != 100 || off != 0 {
		t.Fatalf("parseLimitCursor(9999, -5) = (%d, %d), attendu (100, 0)", got, off)
	}
	if got, off := parseCursor(reqHigh); got != 100 || off != 0 {
		t.Fatalf("parseCursor(9999, -5) = (%d, %d), attendu (100, 0)", got, off)
	}

	reqBad := httptest.NewRequest(http.MethodGet, "/v1/users/alice/followers?limit=0", nil)
	if got, _ := parseFollowPage(reqBad); got != 50 {
		t.Fatalf("parseFollowPage(0) = %d, attendu 50", got)
	}
	if got, _ := parseLimitCursor(reqBad); got != 20 {
		t.Fatalf("parseLimitCursor(0) = %d, attendu 20", got)
	}
	if got, _ := parseCursor(reqBad); got != 20 {
		t.Fatalf("parseCursor(0) = %d, attendu 20", got)
	}
}

func containsCode(body, code string) bool {
	return len(body) > 0 && (stringContains(body, code))
}

func stringContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
