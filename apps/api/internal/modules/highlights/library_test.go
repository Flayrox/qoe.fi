package highlights

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

func contains(s, sub string) bool {
	return strings.Contains(s, sub)
}

func TestParseLimitOffset(t *testing.T) {
	cases := []struct {
		query      string
		wantLimit  int
		wantOffset int
	}{
		{"", 20, 0},
		{"?limit=5&offset=10", 5, 10},
		{"?limit=200", 20, 0}, // borne haute clampée
		{"?limit=0", 20, 0},   // invalide → défaut
		{"?limit=abc", 20, 0}, // invalide → défaut
		{"?offset=-3", 20, 0}, // négatif → 0
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/v1/bookmarks"+c.query, nil)
		limit, offset := parseLimitOffset(req)
		if limit != c.wantLimit || offset != c.wantOffset {
			t.Fatalf("%s: limit/offset = %d/%d, attendu %d/%d",
				c.query, limit, offset, c.wantLimit, c.wantOffset)
		}
	}
}

func TestLibraryHandlers(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()
	if _, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage", nil, true, 0); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Bookmark" (id, "readerId", "articleId") VALUES (gen_random_uuid()::text, $1, $2)`,
		fx.AuthorID, fx.ArticleID); err != nil {
		t.Fatalf("insert bookmark: %v", err)
	}

	r := newHTTPRouter()

	// /v1/bookmarks paginé (plusieurs variantes de query).
	for _, q := range []string{"", "?limit=1&offset=0", "?limit=200", "?offset=-1"} {
		w := doReq(r, http.MethodGet, "/v1/bookmarks"+q, fx.AuthorID, "")
		if w.Code != http.StatusOK {
			t.Fatalf("%s: code = %d, attendu 200 (body %s)", q, w.Code, w.Body.String())
		}
		if !contains(w.Body.String(), "bookmarkId") {
			t.Fatalf("%s: body = %s", q, w.Body.String())
		}
	}

	// /v1/me/highlights + /v1/me/highlights/count.
	w2 := doReq(r, http.MethodGet, "/v1/me/highlights", fx.AuthorID, "")
	if w2.Code != http.StatusOK {
		t.Fatalf("me/highlights = %d, attendu 200", w2.Code)
	}
	w3 := doReq(r, http.MethodGet, "/v1/me/highlights/count", fx.AuthorID, "")
	if w3.Code != http.StatusOK || !contains(w3.Body.String(), `"count":1`) {
		t.Fatalf("count = %d, body = %s, attendu count:1", w3.Code, w3.Body.String())
	}

	// Utilisateur sans données → 200 avec listes vides.
	w4 := doReq(r, http.MethodGet, "/v1/bookmarks", "00000000-0000-0000-0000-00000000dead", "")
	if w4.Code != http.StatusOK {
		t.Fatalf("bookmarks vide = %d, attendu 200", w4.Code)
	}
}
