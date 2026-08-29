package creator

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// reqCtx ajoute UserID + PublicationID au contexte (comme CombinedAuth API-key).
func reqCtx(r *http.Request, userID, pubID string) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.UserIDKey, userID)
	ctx = context.WithValue(ctx, middleware.PublicationIDKey, pubID)
	return r.WithContext(ctx)
}

func TestStripHTMLTags(t *testing.T) {
	if got := stripHTMLTags("<p>Bonjour <b>monde</b></p>", 1<<20); got != "Bonjour monde" {
		t.Fatalf("basique → %q", got)
	}
	// max dépassé → tronque au dernier mot + « … ».
	got := stripHTMLTags("<p>0123456789</p>", 5)
	if !strings.HasSuffix(got, "…") {
		t.Fatalf("troncature → %q", got)
	}
	if got := stripHTMLTags("", 1<<20); got != "" {
		t.Fatalf("vide → %q", got)
	}
	if got := stripHTMLTags("<div></div>", 1<<20); got != "" {
		t.Fatalf("html seul → %q", got)
	}
}

func TestAuthorSlugs(t *testing.T) {
	fx := seedPostsFx(t)
	h := &Handler{pool: poolTest, q: db.New(poolTest)}

	// L'auteur principal est toujours présent.
	got := h.authorSlugs(context.Background(), "art_post_001", "article-bookmark", fx.AuthorID)
	if got[fx.AuthorID] != "article-bookmark" {
		t.Fatalf("slug principal manquant → %v", got)
	}

	// Erreur de requête → on retombe sur l'auteur principal uniquement.
	_, _, fp := newFaultHandler(nil)
	fp.failQuery = true
	h2 := &Handler{pool: fp, q: db.New(poolTest)}
	got2 := h2.authorSlugs(context.Background(), "art_post_001", "article-bookmark", fx.AuthorID)
	if len(got2) != 1 || got2[fx.AuthorID] != "article-bookmark" {
		t.Fatalf("erreur requête → %v", got2)
	}
}

func seedPostsFx(t *testing.T) *testutil.PostFixtures {
	t.Helper()
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed posts: %v", err)
	}
	return fx
}

func TestFault_ApiArticleCreate(t *testing.T) {
	fx := seedPostsFx(t)
	_, _, fp := newFaultHandler(nil)
	h := &Handler{pool: fp, q: db.New(poolTest)}

	// CategoryID fournie + QueryRow en erreur → 400 categoryId inconnue.
	fp.failQueryRow = true
	body := `{"title":"Un titre","categoryId":"cat_inexistante"}`
	r := reqCtx(httptest.NewRequest(http.MethodPost, "/v1/creator/articles", strings.NewReader(body)), fx.AuthorID, "pub_post_001")
	w := httptest.NewRecorder()
	h.apiArticleCreate(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("category QueryRow faute → %d (%s), attendu 400", w.Code, w.Body.String())
	}

	// Insert (Exec) en erreur → 500.
	fp2 := &faultPool{Pool: poolTest, failExec: true}
	h2 := &Handler{pool: fp2, q: db.New(poolTest)}
	r2 := reqCtx(httptest.NewRequest(http.MethodPost, "/v1/creator/articles", strings.NewReader(`{"title":"Sans categorie"}`)), fx.AuthorID, "pub_post_001")
	w2 := httptest.NewRecorder()
	h2.apiArticleCreate(w2, r2)
	if w2.Code != http.StatusInternalServerError {
		t.Fatalf("insert faute → %d (%s), attendu 500", w2.Code, w2.Body.String())
	}
}

func TestFault_ApiMe_PoolError(t *testing.T) {
	fx := seedPostsFx(t)
	_, _, fp := newFaultHandler(nil)
	fp.failQueryRow = true
	h := &Handler{pool: fp, q: db.New(poolTest)}

	r := reqCtx(httptest.NewRequest(http.MethodGet, "/v1/creator/me", nil), fx.AuthorID, "pub_post_001")
	w := httptest.NewRecorder()
	h.apiMe(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("apiMe pool faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func TestFault_ApiArticleUpdate_PoolError(t *testing.T) {
	fx := seedPostsFx(t)
	_, _, fp := newFaultHandler(nil)
	fp.failExec = true
	h := &Handler{pool: fp, q: db.New(poolTest)}

	// Article appartenant au créateur : le flux atteint l'UPDATE → Exec en
	// faute → 500.
	req := httptest.NewRequest(http.MethodPatch, "/v1/creator/articles/art_post_001", strings.NewReader(`{"title":"Nouveau titre"}`))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "art_post_001")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = reqCtx(req, fx.AuthorID, "pub_post_001")
	w := httptest.NewRecorder()
	h.apiArticleUpdate(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("apiArticleUpdate Exec faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func TestFault_ApiHighlights_PoolError(t *testing.T) {
	fx := seedPostsFx(t)
	_, _, fp := newFaultHandler(nil)
	fp.failQuery = true
	h := &Handler{pool: fp, q: db.New(poolTest)}

	r := reqCtx(httptest.NewRequest(http.MethodGet, "/v1/creator/highlights", nil), fx.AuthorID, "pub_post_001")
	w := httptest.NewRecorder()
	h.apiHighlights(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("apiHighlights Query faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func TestFault_ApiHighlightComments_PoolError(t *testing.T) {
	seedPostsFx(t)
	_, _, fp := newFaultHandler(nil)
	fp.failQuery = true
	h := &Handler{pool: fp, q: db.New(poolTest)}

	// handler direct avec id de surlignage (la requête échoue avant scan).
	r := reqCtx(httptest.NewRequest(http.MethodGet, "/v1/creator/highlights/hl_x/comments", nil), "", "pub_post_001")
	w := httptest.NewRecorder()
	h.apiHighlightComments(w, r)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("apiHighlightComments Query faute → %d (%s), attendu 500", w.Code, w.Body.String())
	}
}
