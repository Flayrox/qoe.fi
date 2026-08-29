package settings

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
)

// faultRouter construit le routeur avec un service dont le queryer/pool peut
// être mis en faute, pour couvrir les branches d'erreur des handlers
// (Internal/Forbidden/NotFound/BadRequest) autrement inaccessibles.
func faultRouter(fq *faultQ, fp *faultPool) *chi.Mux {
	svc := &Service{pool: fp, q: fq}
	h := NewHandler(svc)
	auth := middleware.NewAuth(testSecret, "")
	r := chi.NewRouter()
	h.RegisterPublic(r)
	r.Group(func(protected chi.Router) {
		protected.Use(auth.CombinedAuth(db.New(poolTest)))
		h.RegisterProtected(protected)
	})
	return r
}

// faultRouterFromQ est un raccourci : queryer en faute, pool sain.
func faultRouterFromQ(qf map[string]error) *chi.Mux {
	return faultRouter(&faultQ{Queries: db.New(poolTest), fail: qf}, &faultPool{Pool: poolTest})
}

func TestFault_Handlers_InternalErrors(t *testing.T) {
	fx := seed(t)
	tok := testJWT(fx.OwnerID)

	cases := []struct {
		name       string
		qf         map[string]error
		poolFail   string // "exec" | "queryrow" | ""
		method, url string
		body       any
		want       int
	}{
		{"getPreferences-500", nil, "queryrow", http.MethodGet, "/v1/settings/preferences", nil, http.StatusInternalServerError},
		{"updatePreferences-400", nil, "exec", http.MethodPatch, "/v1/settings/preferences", map[string]any{"fontScale": 110}, http.StatusBadRequest},
		{"deletion-get-500", nil, "queryrow", http.MethodGet, "/v1/me/account-deletion-request", nil, http.StatusInternalServerError},
		{"deletion-post-500", nil, "queryrow", http.MethodPost, "/v1/me/account-deletion-request", nil, http.StatusInternalServerError},
		{"deletion-delete-500", nil, "exec", http.MethodDelete, "/v1/me/account-deletion-request", nil, http.StatusInternalServerError},
		{"updateProfile-404", map[string]error{"GetUserForSettings": errBoom}, "", http.MethodPatch, "/v1/settings/profile", map[string]any{"publicationId": fx.PubID, "name": "X"}, http.StatusNotFound},
		{"updateProfile-403", map[string]error{"GetUserPersonalPublication": errBoom}, "", http.MethodPatch, "/v1/settings/profile", map[string]any{"publicationId": fx.PubID, "name": "X"}, http.StatusForbidden},
		{"updateProfile-400", nil, "exec", http.MethodPatch, "/v1/settings/profile", map[string]any{"publicationId": fx.PubID, "name": "X"}, http.StatusBadRequest},
		{"updateSubdomain-400", map[string]error{"UpdatePublicationSubdomain": errBoom}, "", http.MethodPost, "/v1/settings/subdomain", map[string]any{"publicationId": fx.PubID, "subdomain": "test-sub"}, http.StatusBadRequest},
		{"saveNavigation-500", map[string]error{"DeleteNavigationItems": errBoom}, "", http.MethodPut, "/v1/settings/navigation", map[string]any{"publicationId": fx.PubID, "links": []map[string]any{{"label": "L", "url": "/l"}}}, http.StatusInternalServerError},
		{"saveSocial-500", map[string]error{"DeleteSocialLinks": errBoom}, "", http.MethodPut, "/v1/settings/social", map[string]any{"publicationId": fx.PubID, "links": []map[string]any{{"platform": "x", "url": "https://x.com"}}}, http.StatusInternalServerError},
		{"apiApplication-500", map[string]error{"SetApiApplication": errBoom}, "", http.MethodPost, "/v1/settings/api-application", map[string]any{"reason": "j'ai besoin de l'api pour un projet perso"}, http.StatusInternalServerError},
		{"listApiKeys-500", map[string]error{"ListApiKeys": errBoom}, "", http.MethodGet, "/v1/settings/api-keys", nil, http.StatusInternalServerError},
		{"revokeApiKey-500", map[string]error{"DeleteApiKey": errBoom}, "", http.MethodDelete, "/v1/settings/api-keys/abc", nil, http.StatusInternalServerError},
		{"onboarding-500", map[string]error{"UpdatePersonalPublication": errBoom}, "", http.MethodPost, "/v1/settings/onboarding", map[string]any{"name": "Perso"}, http.StatusInternalServerError},
	}

	// Un user sans publication personnelle → chemin création (CreatePersonalPublication).
	if _, err := poolTest.Exec(t.Context(),
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('99999999-9999-9999-9999-999999999999', 'fresh@test.dev', 'freshuser', 'Fresh', 'user', now(), now())`,
	); err != nil {
		t.Fatalf("seed fresh user: %v", err)
	}
	cases = append(cases, struct {
		name        string
		qf          map[string]error
		poolFail    string
		method, url string
		body        any
		want        int
	}{
		"onboarding-create-500", map[string]error{"CreatePersonalPublication": errBoom}, "",
		http.MethodPost, "/v1/settings/onboarding", map[string]any{"name": "Perso"}, http.StatusInternalServerError,
	})
	tokFresh := testJWT("99999999-9999-9999-9999-999999999999")
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var r *chi.Mux
			if tc.poolFail == "exec" {
				fp := &faultPool{Pool: poolTest, failExec: true}
				fq := &faultQ{Queries: db.New(poolTest), fail: tc.qf}
				r = faultRouter(fq, fp)
			} else if tc.poolFail == "queryrow" {
				fp := &faultPool{Pool: poolTest, failQueryRow: true}
				fq := &faultQ{Queries: db.New(poolTest), fail: tc.qf}
				r = faultRouter(fq, fp)
			} else {
				r = faultRouterFromQ(tc.qf)
			}
			tok := tok
			if tc.name == "onboarding-create-500" {
				tok = tokFresh
			}
			w, _ := doJSON(t, r, tc.method, tc.url, tok, tc.body)
			if w.Code != tc.want {
				t.Fatalf("%s %s → %d (%s), attendu %d", tc.method, tc.url, w.Code, w.Body.String(), tc.want)
			}
		})
	}
}
