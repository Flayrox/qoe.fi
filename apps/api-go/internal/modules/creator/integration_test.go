package creator

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

// seedFollows crée : alice (avec publication), bob (avec publication), et un
// follow de bob → alice. Rejouable.
func seedFollows(t *testing.T) (alicePubID, aliceUserID, bobPubID, bobUserID string) {
	t.Helper()
	ctx := context.Background()

	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "Follows", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	aliceUserID = "00000000-0000-0000-0000-000000000100"
	bobUserID = "00000000-0000-0000-0000-000000000101"
	alicePubID = "pub-alice-0001"
	bobPubID = "pub-bob-0002"

	for _, pub := range []struct {
		id, name, slug string
		userID         string
	}{
		{alicePubID, "Alice", "alice", aliceUserID},
		{bobPubID, "Bob", "bob", bobUserID},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
			 VALUES ($1, 'PERSONAL', $2, $3, now(), now())`,
			pub.id, pub.name, pub.slug,
		); err != nil {
			t.Fatalf("publication %s: %v", pub.slug, err)
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, 'creator', $5, now(), now())`,
			pub.userID, pub.slug+"@test.dev", pub.slug, pub.name, pub.id,
		); err != nil {
			t.Fatalf("user %s: %v", pub.slug, err)
		}
	}

	// bob suit alice.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES ('follow_001', $1, $2, now())`,
		bobUserID, alicePubID,
	); err != nil {
		t.Fatalf("follow bob→alice: %v", err)
	}

	return alicePubID, aliceUserID, bobPubID, bobUserID
}

func newTestHandler() *Handler {
	return NewHandler(poolTest, nil, "")
}

func TestFollowers_List(t *testing.T) {
	alicePubID, _, _, bobUserID := seedFollows(t)
	h := newTestHandler()
	ctx := context.Background()

	params := db.ListFollowersByPublicationParams{
		PublicationId: alicePubID,
		ViewerID:      toUUID(bobUserID),
		Limit:         20,
		Offset:        0,
	}
	followers, err := h.q.ListFollowersByPublication(ctx, params)
	if err != nil {
		t.Fatalf("ListFollowersByPublication: %v", err)
	}
	if len(followers) != 1 {
		t.Fatalf("followers = %d, attendu 1", len(followers))
	}
	if followers[0].UserID != bobUserID {
		t.Fatalf("follower = %q, attendu %q (Bob)", followers[0].UserID, bobUserID)
	}
	// Bob est viewer ET l'abonné : il ne suit pas sa propre publication.
	if followers[0].ViewerFollows {
		t.Fatal("viewerFollows = true pour Bob sur sa propre publication")
	}
}

func TestFollowers_ViewerFollowsAnotherFollower(t *testing.T) {
	alicePubID, _, _, bobUserID := seedFollows(t)
	h := newTestHandler()
	ctx := context.Background()
	// Un 2e abonné « carol » suit Alice ; Bob suit aussi Carol.
	carolUserID := "00000000-0000-0000-0000-000000000102"
	carolPubID := "pub-carol-0003"

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Carol', 'carol', now(), now())`,
		carolPubID,
	); err != nil {
		t.Fatalf("publication carol: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'carol@test.dev', 'carol', 'Carol', 'creator', $2, now(), now())`,
		carolUserID, carolPubID,
	); err != nil {
		t.Fatalf("user carol: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES ('follow_002', $1, $2, now())`,
		carolUserID, alicePubID,
	); err != nil {
		t.Fatalf("follow carol→alice: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES ('follow_003', $1, $2, now())`,
		bobUserID, carolPubID,
	); err != nil {
		t.Fatalf("follow bob→carol: %v", err)
	}

	params := db.ListFollowersByPublicationParams{
		PublicationId: alicePubID,
		ViewerID:      toUUID(bobUserID),
		Limit:         20,
		Offset:        0,
	}
	followers, err := h.q.ListFollowersByPublication(ctx, params)
	if err != nil {
		t.Fatalf("followers: %v", err)
	}
	if len(followers) != 2 {
		t.Fatalf("followers = %d, attendu 2", len(followers))
	}
	byID := map[string]db.ListFollowersByPublicationRow{}
	for _, f := range followers {
		byID[f.UserID] = f
	}
	if !byID[carolUserID].ViewerFollows {
		t.Fatal("viewerFollows(carol) = false, attendu true (Bob suit Carol)")
	}
	if byID[bobUserID].ViewerFollows {
		t.Fatal("viewerFollows(bob self) = true, attendu false")
	}
}

func TestFollowing_List(t *testing.T) {
	_, _, _, bobUserID := seedFollows(t)
	h := newTestHandler()
	ctx := context.Background()

	params := db.ListFollowingByUserParams{
		ReaderId: toUUID(bobUserID),
		ViewerID: toUUID(bobUserID),
		Limit:    20,
		Offset:   0,
	}
	following, err := h.q.ListFollowingByUser(ctx, params)
	if err != nil {
		t.Fatalf("ListFollowingByUser: %v", err)
	}
	if len(following) != 1 {
		t.Fatalf("following = %d, attendu 1", len(following))
	}
	if following[0].UserID != "00000000-0000-0000-0000-000000000100" {
		t.Fatalf("following[0] = %q, attendu Alice", following[0].UserID)
	}
	if !following[0].ViewerFollows {
		t.Fatal("viewerFollows = false, attendu true (Bob suit Alice)")
	}
}
