package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

var apiKeyPool *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	apiKeyPool = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

// seedApiKey crée un créateur avec sa publication PERSONAL + une clé API
// `qoe_live_<token>` dont le hash correspond à celui que calcule l'auth.
// Retourne le userID et le publicationID pour les assertions.
func seedApiKey(t *testing.T, ctx context.Context, token string) (userID, pubID string) {
	t.Helper()
	if _, err := apiKeyPool.Exec(ctx, `TRUNCATE TABLE "ApiKey", "User", "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	userID = "00000000-0000-0000-0000-0000000000a1"
	pubID = "pub_apikey"
	if _, err := apiKeyPool.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "umamiWebsiteId", "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'CléPub', 'cle', 'uma-1', now(), now())`, pubID); err != nil {
		t.Fatalf("pub: %v", err)
	}
	if _, err := apiKeyPool.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'cle@t.dev', 'cle', 'Clé', 'creator', $2, now(), now())`, userID, pubID); err != nil {
		t.Fatalf("user: %v", err)
	}
	hash := sha256.Sum256([]byte(token))
	if _, err := apiKeyPool.Exec(ctx,
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId")
		 VALUES ('ak_1', 'clé test', 'qoe_live_', $1, ARRAY['READ','WRITE']::TEXT[], $2)`,
		hex.EncodeToString(hash[:]), userID); err != nil {
		t.Fatalf("apikey: %v", err)
	}
	return userID, pubID
}

func bearer(token string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	return r
}

func TestAPIKeyAuth_Success(t *testing.T) {
	if apiKeyPool == nil {
		t.Skip("base indisponible")
	}
	ctx := context.Background()
	userID, pubID := seedApiKey(t, ctx, "qoe_live_testsecret123")
	q := db.New(apiKeyPool)

	var (
		gotSub, gotPub, gotUmi string
		gotScopes              []string
	)
	h := APIKeyAuth(q)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSub, _ = UserID(r.Context())
		gotPub, _ = PublicationID(r.Context())
		gotUmi, _ = UmamiWebsiteID(r.Context())
		gotScopes, _ = Scopes(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, bearer("qoe_live_testsecret123"))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("code = %d, attendu 204", rr.Code)
	}
	if gotSub != userID {
		t.Errorf("sub = %q, attendu %q", gotSub, userID)
	}
	if gotPub != pubID || gotUmi != "uma-1" {
		t.Errorf("pub=%q umi=%q", gotPub, gotUmi)
	}
	if !HasScope(gotScopes, "READ") || !HasScope(gotScopes, "WRITE") || HasScope(gotScopes, "ANALYTICS") {
		t.Errorf("scopes = %v", gotScopes)
	}
}

func TestAPIKeyAuth_Errors(t *testing.T) {
	if apiKeyPool == nil {
		t.Skip("base indisponible")
	}
	ctx := context.Background()
	seedApiKey(t, ctx, "qoe_live_testsecret456")
	q := db.New(apiKeyPool)

	cases := []struct {
		name string
		req  *http.Request
	}{
		{"sans header", httptest.NewRequest("GET", "/", nil)},
		{"basic (non bearer)", bearer("Basic abc")},
		{"mauvais préfixe", bearer("abc_live_token")},
		{"clé rejetée en DB", bearer("qoe_live_unknown12345")},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			var entered bool
			h := APIKeyAuth(q)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				entered = true
				w.WriteHeader(http.StatusOK)
			}))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, c.req)
			if entered || rr.Code != http.StatusUnauthorized {
				t.Fatalf("entered=%v code=%d, attendu 401 sans entrer", entered, rr.Code)
			}
		})
	}
}

func TestAPIKeyContext(t *testing.T) {
	if apiKeyPool == nil {
		t.Skip("base indisponible")
	}
	ctx := context.Background()
	userID, _ := seedApiKey(t, ctx, "qoe_live_testsecret789")
	q := db.New(apiKeyPool)

	// Clé valide → contexte enrichi.
	c, ok := APIKeyContext(q, bearer("qoe_live_testsecret789"))
	if !ok {
		t.Fatal("clé valide doit retourner ok=true")
	}
	if sub, _ := UserID(c); sub != userID {
		t.Errorf("uid = %q, attendu %q", sub, userID)
	}

	// Pas de header → ok=false.
	if _, ok := APIKeyContext(q, httptest.NewRequest("GET", "/", nil)); ok {
		t.Error("sans header doit retourner ok=false")
	}
	// Mauvais préfixe → ok=false.
	if _, ok := APIKeyContext(q, bearer("other_token")); ok {
		t.Error("mauvais préfixe doit retourner ok=false")
	}
	// Clé inconnue en DB → ok=false.
	if _, ok := APIKeyContext(q, bearer("qoe_live_inconnu12345")); ok {
		t.Error("clé inconnue doit retourner ok=false")
	}
}