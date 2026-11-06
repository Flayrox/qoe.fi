package imports

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// L'import d'articles est volontairement retiré du routeur : ni le mode
// synchrone ni le mode job ne doivent réapparaître sans la refonte documentée
// dans docs/article-import-plan.md.
func TestArticleImportRoutesRemoved(t *testing.T) {
	h := NewHandler(NewService(nil, nil))
	r := chi.NewRouter()
	h.Register(r)

	cases := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/import/articles"},
		{http.MethodPost, "/v1/import/jobs"},
		{http.MethodGet, "/v1/import/jobs"},
		{http.MethodGet, "/v1/import/jobs/job_1"},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s %s = %d, attendu 404 (route retirée)", tc.method, tc.path, w.Code)
		}
	}
}
