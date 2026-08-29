package feed

import (
	"context"
	"testing"
)

func TestInjectDiscovery_InjectsOutOfBubble(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	aliceID := "00000000-0000-0000-0000-000000000011"

	// Le lecteur est dans la bulle pub_engine.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId")
		 VALUES (gen_random_uuid()::text, $1::uuid, 'pub_engine')`, readerID); err != nil {
		t.Fatalf("follow bulle: %v", err)
	}
	// Une publication hors bulle avec un article de qualité (completionRate ≥ 0.8).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_other', 'PERSONAL', 'Autre', 'autre', now(), now())`); err != nil {
		t.Fatalf("pub autre: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
		                        status, "completionRate", "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_discovery', 'Découverte', 'art-discovery', '<p>x</p>', true, 'PUBLIC', 5,
		         'PUBLISHED', 0.9, 'pub_other', $1::uuid, now(), now())`, aliceID); err != nil {
		t.Fatalf("article découverte: %v", err)
	}

	svc := newTestService()
	in := []EngineItem{
		{ItemType: "ARTICLE", ID: "eng_art_a"},
		{ItemType: "THOUGHT", ID: "post1"},
		{ItemType: "ARTICLE", ID: "eng_art_b"},
	}
	out := svc.injectDiscovery(ctx, readerID, in, 10)
	discovered := false
	for _, it := range out {
		if it.ID == "art_discovery" {
			discovered = true
		}
	}
	if !discovered {
		t.Fatalf("l'article de découverte doit être injecté: %+v", out)
	}
}

func TestInjectDiscovery_NoBubbleNoop(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	svc := newTestService()
	// Utilisateur sans aucune follow → pas d'injection.
	in := []EngineItem{{ItemType: "ARTICLE", ID: "eng_art_a"}}
	out := svc.injectDiscovery(ctx, "00000000-0000-0000-0000-000000000010", in, 10)
	if len(out) != len(in) {
		t.Fatalf("sans bulle, items = %d, attendu %d", len(out), len(in))
	}
	// Utilisateur vide → no-op.
	out2 := svc.injectDiscovery(ctx, "", in, 10)
	if len(out2) != len(in) {
		t.Fatalf("userID vide, items = %d", len(out2))
	}
}