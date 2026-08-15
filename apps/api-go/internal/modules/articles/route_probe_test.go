package articles

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func doProbe(t *testing.T, r *chi.Mux, path string) (int, string) {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code, w.Body.String()
}

// TestRoutePriority_StaticOverParam est un test de régression : la route
// publique paramétrée GET /v1/articles/{slug} ne doit JAMAIS masquer les
// routes statiques protégées /v1/articles/capabilities et /by-id/{id}.
// (Historique : RegisterProtected utilisait r.Route(\"/v1/articles\", …), un
// sous-arbre monté à priorité inférieure → capabilities/by-id inaccessibles
// en prod. Corrigé en enregistrant les routes en siblings directs.)
func TestRoutePriority_StaticOverParam(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/v1/articles/{slug}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(201)
		_, _ = w.Write([]byte("param"))
	})
	// Siblings statiques enregistrés APRÈS le param (ordre de main.go).
	r.Get("/v1/articles/capabilities", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(202)
		_, _ = w.Write([]byte("static"))
	})
	r.Get("/v1/articles/by-id/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(203)
		_, _ = w.Write([]byte("byid"))
	})

	code, body := doProbe(t, r, "/v1/articles/capabilities")
	if code != 202 {
		t.Fatalf("/capabilities → %d %q, attendu 202 (statique doit gagner)", code, body)
	}
	code2, body2 := doProbe(t, r, "/v1/articles/by-id/xyz")
	if code2 != 203 {
		t.Fatalf("/by-id/xyz → %d %q, attendu 203", code2, body2)
	}
	// Un vrai slug continue de matcher la route paramétrée.
	code3, body3 := doProbe(t, r, "/v1/articles/mon-article")
	if code3 != 201 {
		t.Fatalf("/mon-article → %d %q, attendu 201", code3, body3)
	}
}
