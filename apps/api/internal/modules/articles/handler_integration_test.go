package articles

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
)

// testSecret est le secret HS256 utilisé pour signer les JWT de test.
const testSecret = "test-secret-0123456789"

// newTestRouter monte le router comme main.go : lecture publique (OptionalAuth)
// + API créateur (CombinedAuth : JWT OU clé API, avec scopes).
func newTestRouter() *chi.Mux {
	svc := newService()
	h := NewHandler(svc)
	auth := middleware.NewAuth(testSecret, "")

	r := chi.NewRouter()
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		h.RegisterPublic(pub)
	})
	r.Group(func(protected chi.Router) {
		protected.Use(auth.CombinedAuth(db.New(poolTest)))
		h.RegisterProtected(protected, middleware.RequireAPIScope)
	})
	return r
}

// testJWT signe un token HS256 pour l'utilisateur donné.
func testJWT(userID string) string {
	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, _ := tok.SignedString([]byte(testSecret))
	return s
}

// insertAPIKey insère une clé API avec un hash connu et des scopes donnés.
func insertAPIKey(t *testing.T, userID string, scopes []string) string {
	t.Helper()
	raw := "qoe_live_" + strings.Repeat("a", 32) + t.Name()
	sum := sha256.Sum256([]byte(raw))
	keyHash := hex.EncodeToString(sum[:])

	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'test', 'qoe_live', $1, $2, $3, now())`,
		keyHash, scopes, userID,
	); err != nil {
		t.Fatalf("insert api key: %v", err)
	}
	return raw
}

func doJSON(t *testing.T, r *chi.Mux, method, path, token string, body any) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var parsed map[string]any
	if strings.Contains(w.Header().Get("Content-Type"), "json") && w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &parsed)
	}
	return w, parsed
}

// ─── Lecture publique (paywall) ───────────────────────────────────────

func TestHandler_GetBySlug_Public_WithPaywall(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()

	// Article premium → contenu tronqué, paywallMeta présent.
	w, body := doJSON(t, r, "GET", "/v1/articles/article-payant?publicationId="+fx.PublicationID, "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["isTruncated"] != true {
		t.Fatalf("isTruncated = %v, attendu true", body["isTruncated"])
	}
	content, _ := body["content"].(string)
	if strings.Contains(content, "PAYANT SENSIBLE") {
		t.Fatal("fuite de contenu payant dans la lecture publique")
	}
	if body["paywallMeta"] == nil {
		t.Fatal("paywallMeta absent")
	}
}

func TestHandler_GetBySlug_Public_MissingPublicationID(t *testing.T) {
	seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "GET", "/v1/articles/article-payant", "", nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestHandler_GetBySlug_Public_UnknownArticle(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "GET", "/v1/articles/n-existe-pas?publicationId="+fx.PublicationID, "", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, attendu 404", w.Code)
	}
}

// ─── Mode créateur (clé API) ──────────────────────────────────────────

func TestHandler_GetBySlug_CreatorMode_APIKey(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	key := insertAPIKey(t, fx.AuthorID, []string{middleware.ScopeRead})

	// La clé API résout la publication personnelle → contrat créateurs {data}.
	w, body := doJSON(t, r, "GET", "/v1/articles/recette-pates", key, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["data"] == nil {
		t.Fatalf("body = %s, attendu enveloppe {data}", w.Body.String())
	}
	data, _ := body["data"].(map[string]any)
	if data["slug"] != "recette-pates" {
		t.Fatalf("data.slug = %v", data["slug"])
	}
	// Le brouillon n'est jamais exposé même avec une clé API.
	w2, _ := doJSON(t, r, "GET", "/v1/articles/brouillon", key, nil)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("status brouillon = %d, attendu 404", w2.Code)
	}
}

func TestHandler_GetBySlug_CreatorMode_ScopeDenied(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	// Clé sans scope READ → 403 sur la lecture.
	key := insertAPIKey(t, fx.AuthorID, []string{middleware.ScopeWrite})

	w, _ := doJSON(t, r, "GET", "/v1/articles/recette-pates", key, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (scope READ requis)", w.Code)
	}
}

func TestHandler_GetBySlug_InvalidAPIKey(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "GET", "/v1/articles/recette-pates?publicationId="+fx.PublicationID, "qoe_live_badkey", nil)
	// Clé invalide → mode créateur ignoré → lecture publique (avec publicationId OK).
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200 (fallback public)", w.Code)
	}
}

// ─── CRUD protégé (JWT) ───────────────────────────────────────────────

func TestHandler_List_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, _ := doJSON(t, r, "GET", "/v1/articles?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	// Mode dashboard (session JWT) : tableau brut, brouillons inclus.
	var data []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("unmarshal tableau: %v", err)
	}
	if len(data) != 4 {
		t.Fatalf("len(data) = %d, attendu 4 (brouillons inclus)", len(data))
	}
}

func TestHandler_List_NoAuth(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "GET", "/v1/articles?publicationId="+fx.PublicationID, "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestHandler_Create_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, body := doJSON(t, r, "POST", "/v1/articles", token, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "Via HTTP",
		"slug":          "via-http",
		"content":       "Contenu via handler",
		"contentFormat": "markdown",
		"status":        "PUBLISHED",
		"published":     true,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["slug"] != "via-http" {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandler_Create_NoAuth(t *testing.T) {
	seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "POST", "/v1/articles", "", map[string]any{"title": "X"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestHandler_Create_InvalidContentFormat(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, _ := doJSON(t, r, "POST", "/v1/articles", token, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "X",
		"content":       "x",
		"contentFormat": "docx",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestHandler_Publish_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, body := doJSON(t, r, "POST", "/v1/articles/art_test_003/publish", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["published"] != true {
		t.Fatalf("body = %s", w.Body.String())
	}

	// Le brouillon est maintenant publié.
	w2, _ := doJSON(t, r, "GET", "/v1/articles/brouillon?publicationId="+fx.PublicationID, "", nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("status après publication = %d", w2.Code)
	}
}

func TestHandler_Delete_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, _ := doJSON(t, r, "DELETE", "/v1/articles/art_test_001?activePublicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestHandler_GetByID_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, body := doJSON(t, r, "GET", "/v1/articles/by-id/art_test_001", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["id"] != "art_test_001" {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandler_Capabilities_WithJWT(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	w, body := doJSON(t, r, "GET", "/v1/articles/capabilities?publicationId="+fx.PublicationID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["isMedia"] != false || body["canPublish"] != true {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandler_Capabilities_NoPublication(t *testing.T) {
	seed(t)
	r := newTestRouter()
	token := testJWT("00000000-0000-0000-0000-000000000099")

	w, _ := doJSON(t, r, "GET", "/v1/articles/capabilities", token, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

// ─── Compteurs (via create) ───────────────────────────────────────────

func TestHandler_Create_ThenList_Integration(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.AuthorID)

	// Création.
	w, _ := doJSON(t, r, "POST", "/v1/articles", token, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "Cycle complet",
		"slug":          "cycle-complet",
		"content":       "Contenu",
		"contentFormat": "markdown",
		"status":        "PUBLISHED",
		"published":     true,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("create status = %d", w.Code)
	}

	// La liste via clé API le voit (publié par défaut).
	key := insertAPIKey(t, fx.AuthorID, []string{middleware.ScopeRead})
	w2, body := doJSON(t, r, "GET", "/v1/articles", key, nil)
	if w2.Code != http.StatusOK {
		t.Fatalf("list status = %d", w2.Code)
	}
	data, _ := body["data"].([]any)
	found := false
	for _, it := range data {
		if m, ok := it.(map[string]any); ok && m["slug"] == "cycle-complet" {
			found = true
		}
	}
	if !found {
		t.Fatal("article créé absent de la liste du contrat créateurs")
	}
}
