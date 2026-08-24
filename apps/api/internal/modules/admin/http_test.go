package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// Tests HTTP du handler admin : matrice d'autorisation (anonyme 401,
// lambda 403, superadmin OK) et contrats des routes sensibles.
// Réutilise poolTest / seedAdmin / newTestService d'integration_test.go.

func newHTTPRouter() http.Handler {
	h := NewHandler(newTestService())
	r := chi.NewRouter()
	h.Register(r)
	return r
}

func do(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── Frontière d'autorisation ──────────────────────────────────────────

func TestAdminRoutes_AuthMatrix(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Anonyme → 401.
	if w := do(r, http.MethodGet, "/v1/admin/dashboard", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme dashboard = %d, attendu 401", w.Code)
	}

	// Utilisateur non-superadmin → 403 sur toutes les routes sensibles.
	// Payloads plausibles par route : les handlers valident le corps avant
	// l'autorisation (le rôle est vérifié dans le service) — sans corps
	// valide on aurait des 400 au lieu du 403 réel.
	type route struct{ method, path, body string }
	routes := []route{
		{"GET", "/v1/admin/dashboard", ""},
		{"GET", "/v1/admin/users", ""},
		{"PATCH", "/v1/admin/users/" + adminCreator, `{"isShadowbanned":false}`},
		{"GET", "/v1/admin/widgets", ""},
		{"POST", "/v1/admin/widgets/featured", `{"articleId":"art_adm_01","featured":true}`},
		{"POST", "/v1/admin/widgets/trends", `{"hashtag":"ia","count":1}`},
		{"POST", "/v1/admin/widgets/promos", `{"title":"Promo","description":"desc"}`},
		{"GET", "/v1/admin/config", ""},
		{"DELETE", "/v1/admin/config/cle-inconnue", ""},
		{"GET", "/v1/admin/oauth/clients", ""},
		{"PATCH", "/v1/admin/oauth/clients/x", `{"status":"APPROVED"}`},
		{"GET", "/v1/admin/api-applicants", ""},
		{"PATCH", "/v1/admin/api-applicants/" + adminCreator, `{"status":"approved"}`},
		{"GET", "/v1/admin/deliveries", ""},
	}
	for _, tc := range routes {
		w := do(r, tc.method, tc.path, adminReaderID, tc.body)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s %s en tant que reader = %d, attendu 403 (%s)",
				tc.method, tc.path, w.Code, w.Body.String())
		}
	}
}

// ─── Dashboard superadmin ──────────────────────────────────────────────

func TestAdminDashboard_Superadmin(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	w := do(r, http.MethodGet, "/v1/admin/dashboard", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("dashboard = %d %s", w.Code, w.Body.String())
	}
	var counts struct {
		Users    int64 `json:"users"`
		Creators int64 `json:"creators"`
		Articles int64 `json:"articles"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &counts); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if counts.Users < 3 {
		t.Fatalf("users = %d, attendu >= 3 (seed)", counts.Users)
	}
	if counts.Articles < 1 {
		t.Fatalf("articles = %d, attendu >= 1", counts.Articles)
	}
}

// ─── Liste & modération utilisateurs ──────────────────────────────────

func TestAdminUsers_ListDetailModerate(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	w := do(r, http.MethodGet, "/v1/admin/users?q=readeradm", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("users list = %d %s", w.Code, w.Body.String())
	}

	w = do(r, http.MethodGet, "/v1/admin/users/"+adminReaderID, adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("user detail = %d %s", w.Code, w.Body.String())
	}

	// Modération : shadowban persisté.
	w = do(r, http.MethodPatch, "/v1/admin/users/"+adminReaderID, adminAdminID,
		`{"isShadowbanned":true}`)
	if w.Code != http.StatusOK {
		t.Fatalf("moderation = %d %s", w.Code, w.Body.String())
	}
	var banned bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "isShadowbanned" FROM "User" WHERE id = $1`,
		adminReaderID).Scan(&banned); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !banned {
		t.Fatal("shadowban non persisté")
	}

	// Cible inexistante → 4xx propre (pas de 5xx).
	w = do(r, http.MethodPatch, "/v1/admin/users/00000000-0000-0000-0000-00000000ffff",
		adminAdminID, `{"isShadowbanned":false}`)
	if w.Code == http.StatusInternalServerError || w.Code >= 500 {
		t.Fatalf("cible inconnue = %d, pas de 5xx attendu", w.Code)
	}
}

// ─── Widgets & config ─────────────────────────────────────────────────

func TestAdminWidgetsAndConfig(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Trend.
	w := do(r, http.MethodPost, "/v1/admin/widgets/trends", adminAdminID,
		`{"hashtag":"ia","count":1}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("add trend = %d %s", w.Code, w.Body.String())
	}

	// Listing widgets.
	w = do(r, http.MethodGet, "/v1/admin/widgets", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("widgets = %d %s", w.Code, w.Body.String())
	}

	// Config système : lecture.
	w = do(r, http.MethodGet, "/v1/admin/config", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("config = %d %s", w.Code, w.Body.String())
	}

	// Suppression d'une clé inconnue : pas de 5xx.
	w = do(r, http.MethodDelete, "/v1/admin/config/inconnue-xyz", adminAdminID, "")
	if w.Code >= 500 {
		t.Fatalf("delete config inconnue = %d, pas de 5xx attendu", w.Code)
	}
}
