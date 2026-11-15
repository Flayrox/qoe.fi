package search

import (
	"context"
	"testing"
)

// TestSearchThoughts — recherche ILIKE sur contenu + tags, hors brouillons.
func TestSearchThoughts(t *testing.T) {
	requirePool(t)
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
	hits, hasMore, err := svc.SearchThoughts(ctx, "machine learning", 20, 0, "")
	if err != nil {
		t.Fatalf("SearchThoughts: %v", err)
	}
	if len(hits) != 1 || hits[0].ID != "post_search_1" {
		t.Fatalf("hits = %+v", hits)
	}
	if hasMore {
		t.Fatal("hasMore = true avec un seul résultat")
	}

	// Tag (#ia) → 1 seule (le brouillon est exclu).
	hits, _, err = svc.SearchThoughts(ctx, "#ia", 20, 0, "")
	if err != nil {
		t.Fatalf("SearchThoughts tag: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("tag hits = %d, want 1 (draft exclu)", len(hits))
	}
}

// Pagination par offset : deux pages sans doublon ni oubli, puis la fin.
func TestSearchThoughtsPagination(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Post", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-0000000000c1', 'pagination@test.dev', 'paginationuser', 'Pagination User', 'user', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "updatedAt", tags, visibility, "contentVisibility", "isDraft", "likeCount", "repostCount", "replyCount")
		 VALUES ('post_page_1', 'Pensée pagination un', '00000000-0000-0000-0000-0000000000c1', now(), ARRAY[]::text[], 'public', 'PUBLIC', false, 0, 0, 0),
		        ('post_page_2', 'Pensée pagination deux', '00000000-0000-0000-0000-0000000000c1', now(), ARRAY[]::text[], 'public', 'PUBLIC', false, 0, 0, 0),
		        ('post_page_3', 'Pensée pagination trois', '00000000-0000-0000-0000-0000000000c1', now(), ARRAY[]::text[], 'public', 'PUBLIC', false, 0, 0, 0)`); err != nil {
		t.Fatalf("posts: %v", err)
	}

	svc := NewSemanticService(poolTest)
	page1, more1, err := svc.SearchThoughts(ctx, "pagination", 2, 0, "")
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if len(page1) != 2 || !more1 {
		t.Fatalf("page 1 = %d hits, more=%v, attendu 2/true", len(page1), more1)
	}

	page2, more2, err := svc.SearchThoughts(ctx, "pagination", 2, 2, "")
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if len(page2) != 1 || more2 {
		t.Fatalf("page 2 = %d hits, more=%v, attendu 1/false", len(page2), more2)
	}

	seen := map[string]bool{}
	for _, hit := range append(page1, page2...) {
		if seen[hit.ID] {
			t.Fatalf("doublon entre pages : %s", hit.ID)
		}
		seen[hit.ID] = true
	}
	if len(seen) != 3 {
		t.Fatalf("ids distincts = %d, attendu 3", len(seen))
	}

	page3, more3, err := svc.SearchThoughts(ctx, "pagination", 2, 3, "")
	if err != nil {
		t.Fatalf("page 3: %v", err)
	}
	if len(page3) != 0 || more3 {
		t.Fatalf("page 3 = %d hits, more=%v, attendu 0/false", len(page3), more3)
	}
}
