package publishers

import (
	"context"
	"testing"
)

func TestArticleResolution_ShortCodeAndHistory(t *testing.T) {
	pubID, userID, articleID := seedPublisher(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	const shortCode = "810839"
	const currentSlug = "mon-article-810839"
	const oldSlug = "ancien-slug-article"
	const customSlug = "slug-perso-auteur"

	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET slug = $2, "shortCode" = $3 WHERE id = $1`,
		articleID, currentSlug, shortCode); err != nil {
		t.Fatalf("update article: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ArticleSlugHistory" (id, "articleId", slug) VALUES ('hist_1', $1, $2)`,
		articleID, oldSlug); err != nil {
		t.Fatalf("insert history: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ArticleSlug" (id, "articleId", "ownerUserId", slug) VALUES ('as_1', $1, $2::uuid, $3)`,
		articleID, userID, customSlug); err != nil {
		t.Fatalf("insert articleSlug: %v", err)
	}

	cases := []struct {
		name  string
		query string
	}{
		{"canonical slug", currentSlug},
		{"trailing shortCode mismatch slug", "titre-different-" + shortCode},
		{"bare shortCode", shortCode},
		{"articleSlug custom", customSlug},
		{"articleSlugHistory", oldSlug},
	}

	for _, tc := range cases {
		t.Run("direct/"+tc.name, func(t *testing.T) {
			art, err := svc.articleDirect(ctx, pubID, tc.query)
			if err != nil {
				t.Fatalf("articleDirect(%q): %v", tc.query, err)
			}
			if art.ID != articleID {
				t.Fatalf("articleDirect(%q) id = %q, attendu %q", tc.query, art.ID, articleID)
			}
		})
		t.Run("attribution/"+tc.name, func(t *testing.T) {
			art, err := svc.articleViaAttribution(ctx, tc.query, userID)
			if err != nil {
				t.Fatalf("articleViaAttribution(%q): %v", tc.query, err)
			}
			if art.ID != articleID {
				t.Fatalf("articleViaAttribution(%q) id = %q, attendu %q", tc.query, art.ID, articleID)
			}
		})
	}
}
