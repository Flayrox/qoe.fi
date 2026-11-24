package articles

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/posts"
)

// ─────────────────────────────────────────────────────────────────────────────
// Réactions (L45) — exécuté sur un vrai PostgreSQL, sans Docker.
// Ces tests prouvent ce que les tests unitaires ne peuvent pas : l'écriture
// réelle dans Interaction, l'unicité, la cohérence avec les lectures de feed,
// et le refus décidé par eligibility.Decide.
// ─────────────────────────────────────────────────────────────────────────────

func newPostsService() *posts.Service { return posts.NewService(poolTest, nil, nil) }

func viewerUUID(id string) pgtype.UUID {
	return pgtype.UUID{Bytes: uuid.MustParse(id), Valid: true}
}

func countInteractions(t *testing.T, targetType, targetID string) int {
	t.Helper()
	var n int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Interaction" WHERE "targetType" = $1 AND "targetId" = $2`,
		targetType, targetID).Scan(&n); err != nil {
		t.Fatalf("count interactions: %v", err)
	}
	return n
}

// insertPost crée une pensée minimale appartenant à authorID.
func insertPost(t *testing.T, id, authorID, visibility string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(), `
		INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", visibility,
			"contentVisibility", "replyRestriction", "likeCount", "repostCount", "replyCount")
		VALUES ($1, 'pensée', $2, now(), now(), $3, 'PUBLIC', 'everyone', 0, 0, 0)
		ON CONFLICT (id) DO NOTHING`, id, authorID, visibility); err != nil {
		t.Fatalf("insert post: %v", err)
	}
}

func TestReactionDB_ArticleLikeLivesInInteraction(t *testing.T) {
	requirePool(t)
	seed(t)
	ctx := context.Background()
	reader := seedReader(t, ctx)
	svc := newPostsService()

	liked, err := svc.ToggleLike(ctx, "art_test_000", reader)
	if err != nil {
		t.Fatalf("like article: %v", err)
	}
	if !liked {
		t.Fatal("le premier like doit être un ajout")
	}

	var kind, targetType string
	if err := poolTest.QueryRow(ctx, `
		SELECT kind, "targetType" FROM "Interaction"
		WHERE "targetId" = 'art_test_000' AND "userId" = $1::uuid`, reader).Scan(&kind, &targetType); err != nil {
		t.Fatalf("ligne Interaction absente: %v", err)
	}
	if kind != "LIKE" || targetType != "ARTICLE" {
		t.Fatalf("ligne = %s/%s, attendu LIKE/ARTICLE", kind, targetType)
	}
	if n := countInteractions(t, "ARTICLE", "art_test_000"); n != 1 {
		t.Fatalf("lignes article = %d, attendu 1", n)
	}

	// Re-like → retrait : plus aucune ligne, et un second retrait est neutre.
	if liked, err = svc.ToggleLike(ctx, "art_test_000", reader); err != nil || liked {
		t.Fatalf("unlike article = %v, %v", liked, err)
	}
	if n := countInteractions(t, "ARTICLE", "art_test_000"); n != 0 {
		t.Fatalf("lignes après unlike = %d", n)
	}
	// Unlike → re-like : l'état revient, sans doublon.
	if liked, err = svc.ToggleLike(ctx, "art_test_000", reader); err != nil || !liked {
		t.Fatalf("re-like article = %v, %v", liked, err)
	}
	if n := countInteractions(t, "ARTICLE", "art_test_000"); n != 1 {
		t.Fatalf("lignes après re-like = %d", n)
	}
}

func TestReactionDB_DoubleLikeIsIdempotent(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	reader := seedReader(t, ctx)
	insertPost(t, "post_like_idem", fx.AuthorID, "public")
	svc := newPostsService()

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.ToggleLike(ctx, "post_like_idem", reader)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("toggle concurrent: %v", err)
		}
	}

	if n := countInteractions(t, "POST", "post_like_idem"); n != 1 {
		t.Fatalf("lignes après deux toggles concurrents = %d, attendu 1", n)
	}
	var likes int
	if err := poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = 'post_like_idem'`).Scan(&likes); err != nil {
		t.Fatalf("likeCount: %v", err)
	}
	if likes < 0 || likes > 1 {
		t.Fatalf("likeCount = %d, hors [0,1] : le compteur a dérivé", likes)
	}
}

func TestReactionDB_UnikeRelyAndSoftDeleteKeepCountersHonest(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	reader := seedReader(t, ctx)
	insertPost(t, "post_lifecycle", fx.AuthorID, "public")
	svc := newPostsService()

	liked, err := svc.ToggleLike(ctx, "post_lifecycle", reader)
	if err != nil || !liked {
		t.Fatalf("like: %v %v", liked, err)
	}
	var likes int
	_ = poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = 'post_lifecycle'`).Scan(&likes)
	if likes != 1 {
		t.Fatalf("likeCount après like = %d", likes)
	}

	if _, err := svc.ToggleLike(ctx, "post_lifecycle", reader); err != nil {
		t.Fatalf("unlike: %v", err)
	}
	_ = poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = 'post_lifecycle'`).Scan(&likes)
	if likes != 0 {
		t.Fatalf("likeCount après unlike = %d", likes)
	}

	// Suppression douce : interdiction de (re)liker, mais le retrait d'un like
	// existant reste possible ; la restauration rend le like normal.
	if _, err := poolTest.Exec(ctx, `UPDATE "Post" SET "deletedAt" = now() WHERE id = 'post_lifecycle'`); err != nil {
		t.Fatalf("soft delete: %v", err)
	}
	if _, err := svc.ToggleLike(ctx, "post_lifecycle", reader); err == nil {
		t.Fatal("liker un post supprimé doit être refusé")
	}
	if _, err := poolTest.Exec(ctx, `UPDATE "Post" SET "deletedAt" = NULL WHERE id = 'post_lifecycle'`); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if liked, err := svc.ToggleLike(ctx, "post_lifecycle", reader); err != nil || !liked {
		t.Fatalf("like après restauration = %v %v", liked, err)
	}
	_ = poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = 'post_lifecycle'`).Scan(&likes)
	if likes != 1 || countInteractions(t, "POST", "post_lifecycle") != 1 {
		t.Fatalf("après restauration : compteur=%d lignes=%d", likes, countInteractions(t, "POST", "post_lifecycle"))
	}
}

func TestReactionDB_FeedLikedFlagMatchesLedger(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	reader := seedReader(t, ctx)
	insertPost(t, "post_feed_liked", fx.AuthorID, "public")
	svc := newPostsService()

	if _, err := svc.ToggleLike(ctx, "post_feed_liked", reader); err != nil {
		t.Fatalf("like: %v", err)
	}

	rows, err := db.New(poolTest).GetPostsByIDs(ctx, db.GetPostsByIDsParams{
		Ids: []string{"post_feed_liked"}, ViewerID: viewerUUID(reader),
	})
	if err != nil || len(rows) != 1 {
		t.Fatalf("GetPostsByIDs: %v (%d lignes)", err, len(rows))
	}
	if !rows[0].ViewerLiked {
		t.Fatal("le feed doit voir le like du registre (liked=true)")
	}

	if _, err := svc.ToggleLike(ctx, "post_feed_liked", reader); err != nil {
		t.Fatalf("unlike: %v", err)
	}
	rows, err = db.New(poolTest).GetPostsByIDs(ctx, db.GetPostsByIDsParams{
		Ids: []string{"post_feed_liked"}, ViewerID: viewerUUID(reader),
	})
	if err != nil || len(rows) != 1 {
		t.Fatalf("GetPostsByIDs après unlike: %v", err)
	}
	if rows[0].ViewerLiked {
		t.Fatal("après unlike, le feed ne doit plus voir de like")
	}
}

func TestReactionDB_InvisibleTargetIsRefusedByEligibility(t *testing.T) {
	requirePool(t)
	fx := seed(t)
	ctx := context.Background()
	reader := seedReader(t, ctx)
	insertPost(t, "post_followers_only", fx.AuthorID, "followers")
	svc := newPostsService()

	_, err := svc.ToggleLike(ctx, "post_followers_only", reader)
	if !errors.Is(err, posts.ErrBlockedContent) {
		t.Fatalf("un post followers non suivi doit être refusé, obtenu %v", err)
	}
	if n := countInteractions(t, "POST", "post_followers_only"); n != 0 {
		t.Fatalf("un refus ne doit écrire aucune ligne, obtenu %d", n)
	}
}
