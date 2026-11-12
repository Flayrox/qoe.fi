package posts

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/antispam"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/secguard"
	"github.com/redis/go-redis/v9"
)

type secguardTestQuerier struct {
	*db.Queries
	authorID string
}

func (q *secguardTestQuerier) WithTx(tx pgx.Tx) ServiceQuerier {
	return &secguardTestQuerier{Queries: db.New(tx), authorID: q.authorID}
}

func (q *secguardTestQuerier) CreateThought(_ context.Context, arg db.CreateThoughtParams) (db.CreateThoughtRow, error) {
	return db.CreateThoughtRow{
		ID:        "thought-stub-1",
		Content:   arg.Content,
		AuthorId:  arg.AuthorId,
		CreatedAt: pgtype.Timestamp{Time: time.Now().UTC(), Valid: true},
	}, nil
}

func (q *secguardTestQuerier) GetPostsByIDs(_ context.Context, _ db.GetPostsByIDsParams) ([]db.GetPostsByIDsRow, error) {
	return []db.GetPostsByIDsRow{
		{
			ID:               "thought-stub-1",
			Content:          "ok",
			AuthorId:         q.authorID,
			AuthorID:         q.authorID,
			CreatedAt:        pgtype.Timestamp{Time: time.Now().UTC(), Valid: true},
			Tags:             []string{},
			ReplyRestriction: "everyone",
		},
	}, nil
}

func (q *secguardTestQuerier) GetAttachmentsByIDs(_ context.Context, _ []string) ([]db.GetAttachmentsByIDsRow, error) {
	return nil, nil
}

func (q *secguardTestQuerier) GetPollsByIDs(_ context.Context, _ []string) ([]db.GetPollsByIDsRow, error) {
	return nil, nil
}

func (q *secguardTestQuerier) GetFollowingStateByAuthorIDs(_ context.Context, _ db.GetFollowingStateByAuthorIDsParams) ([]db.GetFollowingStateByAuthorIDsRow, error) {
	return nil, nil
}

func newSecguardPostsRouter(t *testing.T, userID string, maxBodyBytes int64) *chi.Mux {
	t.Helper()
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	svc := &Service{
		q: &secguardTestQuerier{Queries: db.New(nil), authorID: userID},
	}
	h := NewHandler(svc).SetSecurityGuard(secguard.New(nil, rc))

	r := chi.NewRouter()
	if maxBodyBytes > 0 {
		r.Use(middleware.MaxBodyBytes(maxBodyBytes))
	}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.Register(r)
	return r
}

func doSecJSON(t *testing.T, r http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.10:1234"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func decodeErrCode(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var out struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode error body (%d): %v (%s)", rr.Code, err, rr.Body.String())
	}
	return out.Code
}

func TestSecGuard_PostsOversizedJSON413(t *testing.T) {
	r := newSecguardPostsRouter(t, "00000000-0000-0000-0000-000000000101", 256)
	payload := `{"content":"` + strings.Repeat("a", 512) + `"}`
	rr := doSecJSON(t, r, http.MethodPost, "/v1/posts", payload)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("code = %d, attendu 413 (body=%s)", rr.Code, rr.Body.String())
	}
}

func TestSecGuard_PostsUnsafeURL(t *testing.T) {
	r := newSecguardPostsRouter(t, "00000000-0000-0000-0000-000000000102", 0)
	rr := doSecJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"hello","imageUrl":"javascript:alert(1)"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (body=%s)", rr.Code, rr.Body.String())
	}
	if code := decodeErrCode(t, rr); code != antispam.CodeUnsafeURL {
		t.Fatalf("code = %q, attendu %q", code, antispam.CodeUnsafeURL)
	}
}

func TestSecGuard_PostsZalgoUnicode(t *testing.T) {
	r := newSecguardPostsRouter(t, "00000000-0000-0000-0000-000000000103", 0)
	rr := doSecJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"H\u0301\u0302\u0303\u0304llo"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, attendu 400 (body=%s)", rr.Code, rr.Body.String())
	}
	if code := decodeErrCode(t, rr); code != antispam.CodeSpamUnicode {
		t.Fatalf("code = %q, attendu %q", code, antispam.CodeSpamUnicode)
	}
}

func TestSecGuard_PostsSimHashDuplicate429(t *testing.T) {
	r := newSecguardPostsRouter(t, "00000000-0000-0000-0000-000000000104", 0)

	rr1 := doSecJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"Super promo crypto clique ici"}`)
	if rr1.Code != http.StatusCreated {
		t.Fatalf("1er post code = %d, attendu 201 (body=%s)", rr1.Code, rr1.Body.String())
	}

	rr2 := doSecJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"Super promo crypto clik ici!"}`)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("2e post SimHash code = %d, attendu 429 (body=%s)", rr2.Code, rr2.Body.String())
	}
	if code := decodeErrCode(t, rr2); code != antispam.CodeSpamDuplicate {
		t.Fatalf("code = %q, attendu %q", code, antispam.CodeSpamDuplicate)
	}
	if rr2.Header().Get("Retry-After") == "" {
		t.Fatal("en-tête Retry-After manquant sur 429 SPAM_DUPLICATE")
	}
}

func TestSecGuard_PostsLowTierRateLimit429(t *testing.T) {
	r := newSecguardPostsRouter(t, "00000000-0000-0000-0000-000000000105", 0)

	distinctBodies := []string{
		`{"content":"Premier message totalement distinct sur la finance."}`,
		`{"content":"Deuxième réflexion sur l'industrie logicielle moderne."}`,
		`{"content":"Troisième note concernant l'énergie solaire en Europe."}`,
		`{"content":"Quatrième observation sur l'architecture distribuée."}`,
		`{"content":"Cinquième analyse consacrée aux marchés obligataires."}`,
	}
	for i, body := range distinctBodies {
		rr := doSecJSON(t, r, http.MethodPost, "/v1/posts", body)
		if rr.Code != http.StatusCreated {
			t.Fatalf("requête %d code = %d, attendu 201 (body=%s)", i+1, rr.Code, rr.Body.String())
		}
	}

	rr6 := doSecJSON(t, r, http.MethodPost, "/v1/posts", `{"content":"Sixième pensée bloquée par le quota horaire Low."}`)
	if rr6.Code != http.StatusTooManyRequests {
		t.Fatalf("6e requête code = %d, attendu 429 (body=%s)", rr6.Code, rr6.Body.String())
	}
	if rr6.Header().Get("Retry-After") == "" {
		t.Fatal("en-tête Retry-After manquant sur 429 rate-limit")
	}
}
