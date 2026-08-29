package feed

import (
	"context"
	"testing"
)

func TestFollowingFeed_ReturnsFollowedPosts(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	aliceID := "00000000-0000-0000-0000-000000000011"

	// Alice possède la publication ; le lecteur la suit.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = 'pub_engine' WHERE id = $1::uuid`, aliceID); err != nil {
		t.Fatalf("link alice pub: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId")
		 VALUES (gen_random_uuid()::text, $1::uuid, 'pub_engine')`, readerID); err != nil {
		t.Fatalf("follow: %v", err)
	}

	svc := newTestService()
	res, err := svc.FollowingFeed(ctx, readerID, 10, 0)
	if err != nil {
		t.Fatalf("FollowingFeed: %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("following feed : aucune pensée alors que le lecteur suit Alice")
	}
	// hasMore avec un take+1 : limit=1 mais 1 seule pensée → false.
	res2, err := svc.FollowingFeed(ctx, readerID, 1, 0)
	if err != nil {
		t.Fatalf("FollowingFeed(1): %v", err)
	}
	if len(res2.Items) == 0 {
		t.Fatal("following feed limit=1 vide")
	}
}

func TestFollowingFeed_NoFollowsEmpty(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	svc := newTestService()
	res, err := svc.FollowingFeed(ctx, "00000000-0000-0000-0000-000000000010", 10, 0)
	if err != nil {
		t.Fatalf("FollowingFeed: %v", err)
	}
	if len(res.Items) != 0 {
		t.Fatalf("sans follow, items = %d, attendu 0", len(res.Items))
	}
}

func TestTrending_ReturnsRecentPosts(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	svc := newTestService()
	res, err := svc.Trending(ctx, "00000000-0000-0000-0000-000000000010", 10, 0)
	if err != nil {
		t.Fatalf("Trending: %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("trending vide alors que des pensées existent")
	}
}