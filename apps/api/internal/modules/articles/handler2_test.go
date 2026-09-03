package articles

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

func identityScope(string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler { return next }
}

func newRouter(t *testing.T, userID string) *chi.Mux {
	t.Helper()
	r := chi.NewRouter()
	h := NewHandler(newSvc())
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != "" {
				ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.RegisterPublic(r)
	h.RegisterProtected(r, identityScope)
	return r
}

func doH(t *testing.T, r *chi.Mux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestHandlerArticles_UpdateReview(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	_ = ctx // seed est rejouable
	r := newRouter(t, fx.AuthorID)

	// update valide sur un article de l'auteur.
	if rr := doH(t, r, "PATCH", "/v1/articles/art_test_000", `{"title":"Titre MAJ","content":"<p>nouveau</p>","contentFormat":"html"}`); rr.Code != http.StatusOK {
		t.Fatalf("update code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// contentFormat invalide → 400.
	if rr := doH(t, r, "PATCH", "/v1/articles/art_test_000", `{"contentFormat":"xml"}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("update bad format code = %d", rr.Code)
	}
	// JSON invalide → 400.
	if rr := doH(t, r, "PATCH", "/v1/articles/art_test_000", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("update badjson code = %d", rr.Code)
	}

	// review (approve) sur un article existant.
	if rr := doH(t, r, "POST", "/v1/articles/art_test_000/review", `{"approve":true}`); rr.Code == http.StatusNotFound {
		t.Fatalf("review 404 inattendu")
	} else if rr.Code != http.StatusOK && rr.Code != http.StatusForbidden {
		t.Fatalf("review code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// review sur un article inexistant → 404.
	if rr := doH(t, r, "POST", "/v1/articles/art_absent/review", `{"approve":true}`); rr.Code != http.StatusNotFound {
		t.Fatalf("review inexistant code = %d, attendu 404", rr.Code)
	}
}

func TestHandlerArticles_SimilarAndComments(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	reader := seedReader(t, ctx)
	r := newRouter(t, reader)
	rw := newRouter(t, fx.AuthorID)

	// similar (public).
	if rr := doH(t, rw, "GET", "/v1/articles/art_test_000/similar?limit=4", ""); rr.Code != http.StatusOK {
		t.Fatalf("similar code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// similar d'un article inexistant → 404.
	if rr := doH(t, rw, "GET", "/v1/articles/art_absent/similar", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("similar absent code = %d, attendu 404", rr.Code)
	}

	// listComments (public).
	if rr := doH(t, rw, "GET", "/v1/articles/art_test_000/comments", ""); rr.Code != http.StatusOK {
		t.Fatalf("listComments code = %d", rr.Code)
	}
	// createComment (auth reader) : succès.
	cr := doH(t, r, "POST", "/v1/articles/art_test_000/comments", `{"content":"un commentaire via HTTP"}`)
	if cr.Code != http.StatusCreated {
		t.Fatalf("createComment code = %d, body=%s", cr.Code, cr.Body.String())
	}
	// content vide → 400.
	if rr := doH(t, r, "POST", "/v1/articles/art_test_000/comments", `{"content":""}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("createComment sans content code = %d", rr.Code)
	}
	// JSON invalide → 400.
	if rr := doH(t, r, "POST", "/v1/articles/art_test_000/comments", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("createComment badjson code = %d", rr.Code)
	}
	// createComment sur un article inexistant → 404.
	if rr := doH(t, r, "POST", "/v1/articles/art_absent/comments", `{"content":"x"}`); rr.Code != http.StatusNotFound {
		t.Fatalf("createComment absent code = %d, attendu 404", rr.Code)
	}

	// deleteComment : commentaire inexistant → 404 ; le reader peut le supprimer.
	if rr := doH(t, r, "DELETE", "/v1/articles/comments/commentaire_absente", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("deleteComment absent code = %d, attendu 404", rr.Code)
	}
	// Récupère l'id du commentaire créé pour le supprimer.
	var commentID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "ArticleComment" ORDER BY "createdAt" DESC LIMIT 1`).Scan(&commentID); err != nil {
		t.Fatalf("get comment id: %v", err)
	}
	if rr := doH(t, r, "DELETE", "/v1/articles/comments/"+commentID, ""); rr.Code != http.StatusOK {
		t.Fatalf("deleteComment code = %d, body=%s", rr.Code, rr.Body.String())
	}
}
