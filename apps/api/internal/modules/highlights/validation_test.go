package highlights

import (
	"context"
	"net/http"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

type allowViewQ struct {
	faultQ
}

func (allowViewQ) CanViewArticle(ctx context.Context, arg db.CanViewArticleParams) (bool, error) {
	return true, nil
}

func TestHighlightsValidationAndAntiSpoofing(t *testing.T) {
	svc := &Service{pool: nil, q: allowViewQ{}}
	r := newRouterFor(svc)
	const userID = "00000000-0000-0000-0000-000000000001"

	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{
			name:   "text trop long (> 2000 runes)",
			method: http.MethodPost,
			path:   "/v1/articles/art-1/highlights",
			body:   `{"text":"` + strings.Repeat("é", 2001) + `","isPublic":false}`,
		},
		{
			name:   "text avec contrôle Bidi",
			method: http.MethodPost,
			path:   "/v1/articles/art-1/highlights",
			body:   "{\"text\":\"citation\\u202Ecachee\",\"isPublic\":false}",
		},
		{
			name:   "note trop longue (> 2000 runes)",
			method: http.MethodPost,
			path:   "/v1/articles/art-1/highlights",
			body:   `{"text":"citation valide","note":"` + strings.Repeat("a", 2001) + `","isPublic":false}`,
		},
		{
			name:   "quoteOrdinal hors bornes (> 1000)",
			method: http.MethodPost,
			path:   "/v1/articles/art-1/highlights",
			body:   `{"text":"citation valide","quoteOrdinal":1001,"isPublic":false}`,
		},
		{
			name:   "anti-spoofing citation publique introuvable",
			method: http.MethodPost,
			path:   "/v1/articles/art-1/highlights",
			body:   `{"text":"fausse citation inventée","isPublic":true}`,
		},
		{
			name:   "update note avec contrôle Bidi",
			method: http.MethodPatch,
			path:   "/v1/highlights/hl-1",
			body:   "{\"note\":\"note\\u2066bidi\"}",
		},
		{
			name:   "commentaire trop long (> 2000 runes)",
			method: http.MethodPost,
			path:   "/v1/highlights/hl-1/comments",
			body:   `{"content":"` + strings.Repeat("x", 2001) + `"}`,
		},
		{
			name:   "commentaire avec contrôle Bidi",
			method: http.MethodPost,
			path:   "/v1/highlights/hl-1/comments",
			body:   "{\"content\":\"avis\\u202Ebidi\"}",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := doReq(r, tc.method, tc.path, userID, tc.body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, attendu 400; body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}
