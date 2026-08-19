package settings

import (
	"bytes"
	"context"
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
	"github.com/qoefi/api/internal/testutil"
)

const testSecret = "settings-test-secret-0123456789"

func newTestRouter() *chi.Mux {
	svc := NewService(poolTest)
	h := NewHandler(svc)
	auth := middleware.NewAuth(testSecret, "")

	r := chi.NewRouter()
	h.RegisterPublic(r) // /v1/settings/subdomain/check (public)
	r.Group(func(protected chi.Router) {
		protected.Use(auth.CombinedAuth(db.New(poolTest)))
		h.RegisterProtected(protected)
	})
	return r
}

func testJWT(userID string) string {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(testSecret))
	return s
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

func seed(t *testing.T) *testutil.SettingsFixtures {
	t.Helper()
	fx, err := testutil.SeedSettings(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	return fx
}

// ─── Sous-domaine (public) ────────────────────────────────────────────

func TestHandler_CheckSubdomain_Available(t *testing.T) {
	seed(t)
	r := newTestRouter()

	w, body := doJSON(t, r, "GET", "/v1/settings/subdomain/check?subdomain=mon-super-blog", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["available"] != true {
		t.Fatalf("body = %s, attendu available=true", w.Body.String())
	}
}

func TestHandler_CheckSubdomain_Reserved(t *testing.T) {
	seed(t)
	r := newTestRouter()

	w, body := doJSON(t, r, "GET", "/v1/settings/subdomain/check?subdomain=admin", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if body["available"] != false || body["reason"] == nil {
		t.Fatalf("body = %s, attendu disponible=false + raison", w.Body.String())
	}
}

func TestHandler_CheckSubdomain_Taken(t *testing.T) {
	seed(t)
	r := newTestRouter()

	// "deja-pris" est le subdomain de la publication du média (seed).
	w, body := doJSON(t, r, "GET", "/v1/settings/subdomain/check?subdomain=deja-pris", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if body["available"] != false {
		t.Fatalf("body = %s, attendu disponible=false (déjà pris)", w.Body.String())
	}
}

// ─── Profil ───────────────────────────────────────────────────────────

func TestHandler_UpdateProfile_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "PATCH", "/v1/settings/profile", token, map[string]any{
		"publicationId": fx.PubID,
		"name":          "Nouveau nom",
		"heroText":      "Nouveau héros",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	// La publication a bien été mise à jour (le profil retourné est l'utilisateur).
	var name, heroText string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT name, "heroText" FROM "Publication" WHERE id = $1`, fx.PubID,
	).Scan(&name, &heroText); err != nil {
		t.Fatalf("select publication: %v", err)
	}
	if name != "Nouveau nom" || heroText != "Nouveau héros" {
		t.Fatalf("publication = %q / %q", name, heroText)
	}
}

func TestHandler_UpdateProfile_NoPublication(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "PATCH", "/v1/settings/profile", token, map[string]any{"name": "X"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestHandler_UpdateProfile_ViewerForbidden(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	// viewer n'a pas media:manage_settings.
	w, _ := doJSON(t, r, "PATCH", "/v1/settings/profile", token, map[string]any{
		"publicationId": fx.MediaPubID,
		"name":          "Hack",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (viewer)", w.Code)
	}
}

func TestHandler_UpdateProfile_EditorOverride(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.EditorID)

	// editor a l'override +media:manage_settings → autorisé.
	w, _ := doJSON(t, r, "PATCH", "/v1/settings/profile", token, map[string]any{
		"publicationId": fx.MediaPubID,
		"heroText":      "Édité par editor",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s, attendu 200 (override)", w.Code, w.Body.String())
	}
}

func TestHandler_UpdateProfile_NoAuth(t *testing.T) {
	seed(t)
	r := newTestRouter()

	w, _ := doJSON(t, r, "PATCH", "/v1/settings/profile", "", map[string]any{"name": "X"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

// ─── Sous-domaine (protégé) ───────────────────────────────────────────

func TestHandler_UpdateSubdomain_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/settings/subdomain", token, map[string]any{
		"publicationId": fx.PubID,
		"subdomain":     "mon-nouveau-domaine",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["subdomain"] != "mon-nouveau-domaine" {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandler_UpdateSubdomain_Taken(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/settings/subdomain", token, map[string]any{
		"publicationId": fx.PubID,
		"subdomain":     "deja-pris",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400 (déjà pris)", w.Code)
	}
}

// ─── Navigation / Social ──────────────────────────────────────────────

func TestHandler_SaveNavigation_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "PUT", "/v1/settings/navigation", token, map[string]any{
		"publicationId": fx.PubID,
		"links": []map[string]any{
			{"label": "Accueil", "url": "/"},
			{"label": "À propos", "url": "/a-propos"},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["success"] != true {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandler_SaveSocial_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "PUT", "/v1/settings/social", token, map[string]any{
		"publicationId": fx.PubID,
		"links": []map[string]any{
			{"platform": "x", "url": "https://x.com/qoe"},
			{"platform": "github", "url": "https://github.com/qoe"},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

// ─── Clés API ─────────────────────────────────────────────────────────

func TestHandler_SubmitApiApplication(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/settings/api-application", token, map[string]any{
		"reason": "Je veux intégrer qoe.fi comme CMS pour mon média.",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestHandler_SubmitApiApplication_TooShort(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, _ := doJSON(t, r, "POST", "/v1/settings/api-application", token, map[string]any{"reason": "court"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400 (raison trop courte)", w.Code)
	}
}

func TestHandler_GenerateApiKey_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	w, body := doJSON(t, r, "POST", "/v1/settings/api-keys", token, map[string]any{
		"name":   "Clé CMS",
		"scopes": []string{"READ", "WRITE"},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	apiKey, _ := body["apiKey"].(string)
	if !strings.HasPrefix(apiKey, "qoe_live_") {
		t.Fatalf("apiKey = %q", apiKey)
	}
}

func TestHandler_GenerateApiKey_NotApproved(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	// viewer n'est pas approved → refus.
	w, _ := doJSON(t, r, "POST", "/v1/settings/api-keys", token, map[string]any{"name": "X"})
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, attendu 403 (non approuvé)", w.Code)
	}
}

func TestHandler_RevokeApiKey_Owner(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.OwnerID)

	// Crée une clé puis la révoque.
	_, body := doJSON(t, r, "POST", "/v1/settings/api-keys", token, map[string]any{"name": "À révoquer"})
	var keyID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "ApiKey" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		fx.OwnerID,
	).Scan(&keyID); err != nil {
		t.Fatalf("select clé: %v", err)
	}
	_ = body

	w, _ := doJSON(t, r, "DELETE", "/v1/settings/api-keys/"+keyID, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "ApiKey" WHERE id = $1`, keyID,
	).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("clé encore présente (%d)", n)
	}
}

// ─── Onboarding ───────────────────────────────────────────────────────

func TestHandler_CompleteOnboarding(t *testing.T) {
	fx := seed(t)
	r := newTestRouter()
	token := testJWT(fx.ViewerID)

	w, _ := doJSON(t, r, "POST", "/v1/settings/onboarding", token, map[string]any{
		"name":        "Mon Média",
		"heroText":    "Bienvenue",
		"subdomain":   "mon-media",
		"layoutStyle": "magazine",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	// Le user a maintenant une publication personnelle.
	var role string
	var pubID *string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT role, "publicationId" FROM "User" WHERE id = $1`, fx.ViewerID,
	).Scan(&role, &pubID); err != nil {
		t.Fatalf("select user: %v", err)
	}
	if role != "creator" || pubID == nil || *pubID == "" {
		t.Fatalf("user = %q / %v, attendu creator + publication liée", role, pubID)
	}
}
