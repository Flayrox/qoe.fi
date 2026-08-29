package highlights

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	db "github.com/qoefi/api/internal/database"
)

type faultQ struct {
	err error
}

func (f faultQ) CountHighlightUpvotes(ctx context.Context, highlightid string) (int32, error) {
	return 0, f.err
}
func (f faultQ) CreateAnnotationComment(ctx context.Context, arg db.CreateAnnotationCommentParams) (string, error) {
	return "", f.err
}
func (f faultQ) CreateHighlight(ctx context.Context, arg db.CreateHighlightParams) (string, error) {
	return "", f.err
}
func (f faultQ) DeleteAnnotationComment(ctx context.Context, arg db.DeleteAnnotationCommentParams) (int64, error) {
	return 0, f.err
}
func (f faultQ) DeleteHighlight(ctx context.Context, arg db.DeleteHighlightParams) (int64, error) {
	return 0, f.err
}
func (f faultQ) DeleteHighlightUpvote(ctx context.Context, arg db.DeleteHighlightUpvoteParams) error {
	return f.err
}
func (f faultQ) GetHighlightByID(ctx context.Context, id string) (db.GetHighlightByIDRow, error) {
	return db.GetHighlightByIDRow{}, f.err
}
func (f faultQ) ListAnnotationComments(ctx context.Context, highlightid string) ([]db.ListAnnotationCommentsRow, error) {
	return nil, f.err
}
func (f faultQ) ListBookmarksByReader(ctx context.Context, arg db.ListBookmarksByReaderParams) ([]db.ListBookmarksByReaderRow, error) {
	return nil, f.err
}
func (f faultQ) ListHighlightsByArticle(ctx context.Context, arg db.ListHighlightsByArticleParams) ([]db.ListHighlightsByArticleRow, error) {
	return nil, f.err
}
func (f faultQ) ListMyHighlights(ctx context.Context, arg db.ListMyHighlightsParams) ([]db.ListMyHighlightsRow, error) {
	return nil, f.err
}
func (f faultQ) ToggleHighlightUpvote(ctx context.Context, arg db.ToggleHighlightUpvoteParams) (int32, error) {
	return 0, f.err
}
func (f faultQ) UpdateHighlight(ctx context.Context, arg db.UpdateHighlightParams) (db.UpdateHighlightRow, error) {
	return db.UpdateHighlightRow{}, f.err
}

// TestHandler500Branches : chaque route du handler renvoie 500 quand le
// service échoue sur une erreur générique.
func TestHandler500Branches(t *testing.T) {
	svc := &Service{pool: poolTest, q: faultQ{err: errors.New("boom")}}
	r := newRouterFor(svc)

	cases := []struct{ method, path, body string }{
		{http.MethodGet, "/v1/articles/art/highlights", ""},
		{http.MethodPost, "/v1/articles/art/highlights", `{"text":"x"}`},
		{http.MethodPatch, "/v1/highlights/hl", `{"content":"x"}`},
		{http.MethodDelete, "/v1/highlights/hl", ""},
		{http.MethodPost, "/v1/highlights/hl/upvote", ""},
		{http.MethodGet, "/v1/highlights/hl/comments", ""},
		{http.MethodPost, "/v1/highlights/hl/comments", `{"content":"c"}`},
		{http.MethodDelete, "/v1/highlights/comments/c1", ""},
		{http.MethodGet, "/v1/bookmarks", ""},
		{http.MethodGet, "/v1/me/highlights", ""},
		{http.MethodGet, "/v1/me/highlights/count", ""},
	}
	for _, c := range cases {
		w := doReq(r, c.method, c.path, "user", c.body)
		if w.Code != http.StatusInternalServerError {
			t.Fatalf("%s %s = %d, attendu 500 (body %s)", c.method, c.path, w.Code, w.Body.String())
		}
	}
}

// newRouterFor monte le routeur complet sur un service donné.
func newRouterFor(svc *Service) http.Handler {
	r := chi.NewRouter()
	h := NewHandler(svc)
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	return r
}
