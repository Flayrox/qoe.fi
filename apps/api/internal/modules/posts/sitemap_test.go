package posts

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// TestSitemapThoughts — catalogue SEO des pensées : originaux + réponses +
// citations inclus ; reposts purs, brouillons et supprimés exclus.
// Pagination par offset, total stable, limite bornée à 1000.
func TestSitemapThoughts(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seedPosts(t)
	svc := newTestService()

	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := poolTest.Exec(ctx, q, args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	// Réponse à la pensée d'AuthorID.
	exec(`INSERT INTO "Post" (id, content, "authorId", "updatedAt", "parentId", "rootId", visibility, "contentVisibility", "isDraft")
	      VALUES ('thought-reply-1', 'Bonne remarque', $1, now(), $2, $2, 'public', 'PUBLIC', false)`,
		fx.ViewerID, fx.PostID)
	// Repost pur (contenu vide) → exclu.
	exec(`INSERT INTO "Post" (id, content, "authorId", "updatedAt", "repostId", visibility, "contentVisibility", "isDraft")
	      VALUES ('thought-repost-1', '', $1, now(), $2, 'public', 'PUBLIC', false)`,
		fx.ViewerID, fx.PostID)
	// Citation (repost + commentaire) → incluse.
	exec(`INSERT INTO "Post" (id, content, "authorId", "updatedAt", "repostId", visibility, "contentVisibility", "isDraft")
	      VALUES ('thought-quote-1', 'À lire absolument', $1, now(), $2, 'public', 'PUBLIC', false)`,
		fx.ViewerID, fx.PostID)
	// Brouillon → exclu.
	exec(`INSERT INTO "Post" (id, content, "authorId", "updatedAt", visibility, "contentVisibility", "isDraft")
	      VALUES ('thought-draft-1', 'Brouillon', $1, now(), 'public', 'PUBLIC', true)`, fx.ViewerID)
	// Supprimé → exclu.
	exec(`INSERT INTO "Post" (id, content, "authorId", "updatedAt", "deletedAt", visibility, "contentVisibility", "isDraft")
	      VALUES ('thought-deleted-1', 'Supprimé', $1, now(), now(), 'public', 'PUBLIC', false)`, fx.ViewerID)

	res, err := svc.SitemapThoughts(ctx, 100, 0)
	if err != nil {
		t.Fatalf("SitemapThoughts: %v", err)
	}
	seen := map[string]bool{}
	for _, it := range res.Items {
		seen[it.ID] = true
		if it.AuthorUsername == "" || it.UpdatedAt == "" {
			t.Fatalf("entrée incomplète : %+v", it)
		}
	}
	// Inclus : les 2 pensées fixtures + réponse + citation.
	for _, id := range []string{fx.PostID, fx.Post2ID, "thought-reply-1", "thought-quote-1"} {
		if !seen[id] {
			t.Fatalf("attendu dans le catalogue : %s (vus : %v)", id, keysOf(seen))
		}
	}
	// Exclus : repost pur, brouillon, supprimé.
	for _, id := range []string{"thought-repost-1", "thought-draft-1", "thought-deleted-1"} {
		if seen[id] {
			t.Fatalf("ne devrait pas être indexé : %s", id)
		}
	}
	if res.Total < int64(len(res.Items)) {
		t.Fatalf("total=%d < items=%d", res.Total, len(res.Items))
	}

	// Offset au-delà du total → page vide.
	res2, err := svc.SitemapThoughts(ctx, 100, 1000000)
	if err != nil {
		t.Fatalf("offset énorme: %v", err)
	}
	if len(res2.Items) != 0 || res2.Total != res.Total {
		t.Fatalf("page vide = (%d, total %d)", len(res2.Items), res2.Total)
	}

	// Endpoint HTTP : shape + borne de limite.
	r := newTestRouter(t, "")
	w := doJSON(t, r, http.MethodGet, "/v1/seo/sitemap-thoughts?limit=999999&offset=0", "")
	if w.Code != http.StatusOK {
		t.Fatalf("endpoint = %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Limit int `json:"limit"`
		Total int64 `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if out.Limit != 1000 {
		t.Fatalf("limite = %d, attendu borne 1000", out.Limit)
	}
	if out.Total != res.Total {
		t.Fatalf("total endpoint=%d, service=%d", out.Total, res.Total)
	}
}

func keysOf(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
