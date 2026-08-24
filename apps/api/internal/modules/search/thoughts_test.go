package search

import (
	"context"
	"testing"
)

// TestSearchThoughts — recherche ILIKE sur contenu + tags, hors brouillons.
func TestSearchThoughts(t *testing.T) {
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Post", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000b1', 'thoughts@test.dev', 'thoughtuser', 'Thought User', 'user', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "updatedAt", tags, visibility, "contentVisibility", "isDraft", "likeCount", "repostCount", "replyCount")
		 VALUES ('post_search_1', 'Une pensée sur le machine learning', '00000000-0000-0000-0000-0000000000b1', now(), ARRAY['ml','ia'], 'public', 'PUBLIC', false, 0, 0, 0),
		        ('post_search_2', 'Pensée privée sur l''ia', '00000000-0000-0000-0000-0000000000b1', now(), ARRAY['ia'], 'public', 'PUBLIC', true, 0, 0, 0),
		        ('post_search_3', 'Autre sujet complet', '00000000-0000-0000-0000-0000000000b1', now(), ARRAY['tech'], 'public', 'PUBLIC', false, 0, 0, 0)`); err != nil {
		t.Fatalf("posts: %v", err)
	}

	svc := NewSemanticService(poolTest)

	// Contenu.
	hits, err := svc.SearchThoughts(ctx, "machine learning", 20)
	if err != nil {
		t.Fatalf("SearchThoughts: %v", err)
	}
	if len(hits) != 1 || hits[0].ID != "post_search_1" {
		t.Fatalf("hits = %+v", hits)
	}

	// Tag (#ia) → 1 seule (le brouillon est exclu).
	hits, err = svc.SearchThoughts(ctx, "#ia", 20)
	if err != nil {
		t.Fatalf("SearchThoughts tag: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("tag hits = %d, want 1 (draft exclu)", len(hits))
	}
}
