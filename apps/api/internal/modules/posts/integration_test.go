package posts

import (
	"context"
	"log"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
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

func seedPosts(t *testing.T) *testutil.PostFixtures {
	t.Helper()
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed posts: %v", err)
	}
	return fx
}

func newTestService() *Service {
	// Pas de Redis en test : les invalidations de cache sont des no-op (nil safe).
	return NewService(poolTest, nil)
}

// ─── Création ──────────────────────────────────────────────────────────

func TestCreateThought_Basic(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	thought, err := svc.Create(ctx, fx.AuthorID, "Nouvelle pensée avec #tags", []string{"go", "test"}, nil, nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if thought.Content != "Nouvelle pensée avec #tags" {
		t.Fatalf("content = %q", thought.Content)
	}
	if thought.AuthorID != fx.AuthorID {
		t.Fatalf("authorId = %q", thought.AuthorID)
	}
	if len(thought.Tags) != 2 || thought.Tags[0] != "go" {
		t.Fatalf("tags = %v", thought.Tags)
	}
	if thought.LikeCount != 0 || thought.RepostCount != 0 || thought.ReplyCount != 0 {
		t.Fatalf("counts = %d/%d/%d", thought.LikeCount, thought.RepostCount, thought.ReplyCount)
	}
	if thought.Liked {
		t.Fatal("liked = true pour un nouveau post")
	}
	if thought.Author.ID != fx.AuthorID || thought.Author.Username == nil || *thought.Author.Username != "alice" {
		t.Fatalf("author = %+v", thought.Author)
	}
}

func TestCreateThought_EmptyContent_Error(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	_, err := svc.Create(ctx, fx.AuthorID, "", nil, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "contenu requis") {
		t.Fatalf("Create(vide) = %v, attendu erreur contenu requis", err)
	}
}

// ─── Likes ─────────────────────────────────────────────────────────────

func TestToggleLike_AddThenRemove(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Bob like la pensée d'Alice → liked.
	liked, err := svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleLike(add): %v", err)
	}
	if !liked {
		t.Fatal("ToggleLike(add) = false, attendu true")
	}

	var likeCount int
	if err := poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&likeCount); err != nil {
		t.Fatalf("likeCount: %v", err)
	}
	if likeCount != 1 {
		t.Fatalf("likeCount = %d, attendu 1", likeCount)
	}

	// Notification LIKE créée pour Alice.
	var notifType string
	err = poolTest.QueryRow(ctx,
		`SELECT type FROM "Notification" WHERE "recipientId" = $1 AND "senderId" = $2 AND "thoughtId" = $3`,
		fx.AuthorID, fx.ViewerID, fx.PostID,
	).Scan(&notifType)
	if err != nil {
		t.Fatalf("notification LIKE: %v", err)
	}
	if notifType != "LIKE" {
		t.Fatalf("notification type = %q", notifType)
	}

	// Bob unlike → removed.
	liked, err = svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleLike(remove): %v", err)
	}
	if liked {
		t.Fatal("ToggleLike(remove) = true, attendu false")
	}
	if err := poolTest.QueryRow(ctx, `SELECT "likeCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&likeCount); err != nil {
		t.Fatalf("likeCount: %v", err)
	}
	if likeCount != 0 {
		t.Fatalf("likeCount après unlike = %d, attendu 0", likeCount)
	}
}

func TestToggleLike_NoSelfNotification(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Alice like sa propre pensée → pas de notification (pas d'auto-notif).
	if _, err := svc.ToggleLike(ctx, fx.PostID, fx.AuthorID); err != nil {
		t.Fatalf("ToggleLike(self): %v", err)
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Notification"`).Scan(&n); err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	if n != 0 {
		t.Fatalf("notifications = %d, attendu 0 (self-like)", n)
	}
}

// ─── Reposts ───────────────────────────────────────────────────────────

func TestToggleRepost_AddThenRemove(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	reposted, err := svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleRepost(add): %v", err)
	}
	if !reposted {
		t.Fatal("ToggleRepost(add) = false, attendu true")
	}

	var repostCount int
	if err := poolTest.QueryRow(ctx, `SELECT "repostCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&repostCount); err != nil {
		t.Fatalf("repostCount: %v", err)
	}
	if repostCount != 1 {
		t.Fatalf("repostCount = %d, attendu 1", repostCount)
	}

	// Le repost pur existe (pensée vide pointant vers l'original).
	var pureCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Post" WHERE "authorId" = $1 AND "repostId" = $2`,
		fx.ViewerID, fx.PostID,
	).Scan(&pureCount); err != nil {
		t.Fatalf("count pure reposts: %v", err)
	}
	if pureCount != 1 {
		t.Fatalf("pure reposts = %d, attendu 1", pureCount)
	}

	// Retrait du repost.
	reposted, err = svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleRepost(remove): %v", err)
	}
	if reposted {
		t.Fatal("ToggleRepost(remove) = true, attendu false")
	}
	if err := poolTest.QueryRow(ctx, `SELECT "repostCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&repostCount); err != nil {
		t.Fatalf("repostCount: %v", err)
	}
	if repostCount != 0 {
		t.Fatalf("repostCount après retrait = %d, attendu 0", repostCount)
	}
}

// ─── Réponses ──────────────────────────────────────────────────────────

func TestReply_CreatesThreadAndIncrementsCount(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	reply, err := svc.Reply(ctx, fx.PostID, fx.ViewerID, "Réponse de Bob")
	if err != nil {
		t.Fatalf("Reply: %v", err)
	}
	if reply.ParentID == nil || *reply.ParentID != fx.PostID {
		t.Fatalf("parentId = %v, attendu %q", reply.ParentID, fx.PostID)
	}
	if reply.RootID == nil || *reply.RootID != fx.PostID {
		t.Fatalf("rootId = %v, attendu %q", reply.RootID, fx.PostID)
	}
	if reply.AuthorID != fx.ViewerID {
		t.Fatalf("authorId = %q", reply.AuthorID)
	}

	// Le compteur du parent a été incrémenté.
	var replyCount int
	if err := poolTest.QueryRow(ctx, `SELECT "replyCount" FROM "Post" WHERE id = $1`, fx.PostID).Scan(&replyCount); err != nil {
		t.Fatalf("replyCount: %v", err)
	}
	if replyCount != 1 {
		t.Fatalf("replyCount = %d, attendu 1", replyCount)
	}

	// Notification REPLY créée pour Alice (best-effort).
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Notification" WHERE type = 'REPLY' AND "recipientId" = $1`,
		fx.AuthorID,
	).Scan(&n); err != nil {
		t.Fatalf("count REPLY notifications: %v", err)
	}
	if n != 1 {
		t.Fatalf("REPLY notifications = %d, attendu 1", n)
	}
}

// ─── Sondages ──────────────────────────────────────────────────────────

func TestVotePoll_AddThenChange(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Crée un sondage sur la pensée d'Alice avec 2 options.
	var pollID string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Poll" (id, "thoughtId", "expiresAt") VALUES (gen_random_uuid()::text, $1, now() + interval '1 day') RETURNING id`,
		fx.PostID,
	).Scan(&pollID); err != nil {
		t.Fatalf("create poll: %v", err)
	}
	var opt1, opt2 string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "PollOption" (id, "pollId", text, "order") VALUES (gen_random_uuid()::text, $1, 'Option A', 0) RETURNING id`,
		pollID,
	).Scan(&opt1); err != nil {
		t.Fatalf("create option 1: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "PollOption" (id, "pollId", text, "order") VALUES (gen_random_uuid()::text, $1, 'Option B', 1) RETURNING id`,
		pollID,
	).Scan(&opt2); err != nil {
		t.Fatalf("create option 2: %v", err)
	}

	// Bob vote pour l'option A.
	poll, err := svc.VotePoll(ctx, fx.PostID, opt1, fx.ViewerID)
	if err != nil {
		t.Fatalf("VotePoll: %v", err)
	}
	if poll.UserVotedOptionID == nil || *poll.UserVotedOptionID != opt1 {
		t.Fatalf("userVotedOptionId = %v, attendu %s", poll.UserVotedOptionID, opt1)
	}
	if poll.TotalVotes != 1 {
		t.Fatalf("totalVotes = %d, attendu 1", poll.TotalVotes)
	}
	if poll.Options[0].VoteCount != 1 || poll.Options[0].Percentage != 100 {
		t.Fatalf("option A = %+v, attendu voteCount=1 percentage=100", poll.Options[0])
	}

	// Bob change pour l'option B (idempotent, remplace le vote).
	poll, err = svc.VotePoll(ctx, fx.PostID, opt2, fx.ViewerID)
	if err != nil {
		t.Fatalf("VotePoll(change): %v", err)
	}
	if poll.UserVotedOptionID == nil || *poll.UserVotedOptionID != opt2 {
		t.Fatalf("userVotedOptionId = %v, attendu %s", poll.UserVotedOptionID, opt2)
	}
	if poll.TotalVotes != 1 {
		t.Fatalf("totalVotes = %d, attendu 1 (changement d'option)", poll.TotalVotes)
	}

	// Bob retire son vote.
	poll, err = svc.UnvotePoll(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("UnvotePoll: %v", err)
	}
	if poll.UserVotedOptionID != nil {
		t.Fatalf("userVotedOptionId = %v, attendu nil", poll.UserVotedOptionID)
	}
	if poll.TotalVotes != 0 {
		t.Fatalf("totalVotes = %d, attendu 0", poll.TotalVotes)
	}
}

// ─── Listes d'engagement (likes/reposts/quotes) ───────────────────────────

func TestLikes_Paginated(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Bob like + Alice like (self-like ok pour le test).
	if _, err := svc.ToggleLike(ctx, fx.PostID, fx.ViewerID); err != nil {
		t.Fatalf("like bob: %v", err)
	}
	if _, err := svc.ToggleLike(ctx, fx.PostID, fx.AuthorID); err != nil {
		t.Fatalf("like alice: %v", err)
	}

	page, err := svc.Likes(ctx, fx.PostID, 10, 0)
	if err != nil {
		t.Fatalf("Likes: %v", err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("likes = %d, attendu 2", len(page.Items))
	}
	if page.HasMore {
		t.Fatal("hasMore = true pour 2 likes")
	}
	foundBob := false
	for _, a := range page.Items {
		if a.ID == fx.ViewerID {
			foundBob = true
		}
	}
	if !foundBob {
		t.Fatal("Bob manquant dans les likes")
	}
}

func TestReposts_Paginated(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	if _, err := svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID); err != nil {
		t.Fatalf("repost bob: %v", err)
	}

	page, err := svc.Reposts(ctx, fx.PostID, 10, 0)
	if err != nil {
		t.Fatalf("Reposts: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("reposts = %d, attendu 1", len(page.Items))
	}
	if page.Items[0].ID != fx.ViewerID {
		t.Fatalf("reposter = %q, attendu %q", page.Items[0].ID, fx.ViewerID)
	}
}

func TestQuotes_OnlyPostsWithText(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Repost pur (sans texte) → PAS une citation.
	if _, err := svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID); err != nil {
		t.Fatalf("repost pur: %v", err)
	}
	// Citation : contenu + repostId.
	quote, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content:  "Citation avec texte",
		RepostID: &fx.PostID,
	})
	if err != nil {
		t.Fatalf("citation: %v", err)
	}

	page, err := svc.Quotes(ctx, fx.PostID, fx.ViewerID, 10, 0)
	if err != nil {
		t.Fatalf("Quotes: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("quotes = %d, attendu 1 (le pur repost n'est pas une citation)", len(page.Items))
	}
	if page.Items[0].ID != quote.ID {
		t.Fatalf("quote = %q, attendu %q", page.Items[0].ID, quote.ID)
	}
}

// ─── Block / Mute / Report ────────────────────────────────────────────

func TestToggleBlock_AddThenRemove(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	blocked, err := svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleBlock(add): %v", err)
	}
	if !blocked {
		t.Fatal("ToggleBlock(add) = false")
	}

	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "BlockedUser" WHERE "creatorId" = $1 AND "readerId" = $2`,
		fx.AuthorID, fx.ViewerID,
	).Scan(&n); err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if n != 1 {
		t.Fatalf("blocks = %d, attendu 1", n)
	}

	blocked, err = svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleBlock(remove): %v", err)
	}
	if blocked {
		t.Fatal("ToggleBlock(remove) = true")
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "BlockedUser" WHERE "creatorId" = $1 AND "readerId" = $2`,
		fx.AuthorID, fx.ViewerID,
	).Scan(&n); err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if n != 0 {
		t.Fatalf("blocks après retrait = %d, attendu 0", n)
	}
}

func TestToggleMute_AddThenRemove(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	muted, err := svc.ToggleMute(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleMute(add): %v", err)
	}
	if !muted {
		t.Fatal("ToggleMute(add) = false")
	}

	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MutedUser" WHERE "muterId" = $1 AND "mutedId" = $2`,
		fx.ViewerID, fx.AuthorID,
	).Scan(&n); err != nil {
		t.Fatalf("count mutes: %v", err)
	}
	if n != 1 {
		t.Fatalf("mutes = %d, attendu 1", n)
	}

	muted, err = svc.ToggleMute(ctx, fx.AuthorID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleMute(remove): %v", err)
	}
	if muted {
		t.Fatal("ToggleMute(remove) = true")
	}
}

func TestReport_CreatesModerationReport(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	if err := svc.Report(ctx, fx.ViewerID, fx.PostID, "thought", "spam", "Contenu spam détecté"); err != nil {
		t.Fatalf("Report: %v", err)
	}

	var status, reason string
	if err := poolTest.QueryRow(ctx,
		`SELECT status, reason FROM "ModerationReport" WHERE "targetId" = $1 AND "targetType" = 'thought'`,
		fx.PostID,
	).Scan(&status, &reason); err != nil {
		t.Fatalf("read report: %v", err)
	}
	if status != "pending" || reason != "spam" {
		t.Fatalf("report = %q/%q, attendu pending/spam", status, reason)
	}
}

// ─── Bookmarks ─────────────────────────────────────────────────────────

func TestToggleBookmark_AddThenRemove(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	added, err := svc.ToggleBookmark(ctx, fx.ArticleID, fx.AuthorID)
	if err != nil {
		t.Fatalf("ToggleBookmark(add): %v", err)
	}
	if !added {
		t.Fatal("ToggleBookmark(add) = false, attendu true")
	}

	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Bookmark" WHERE "readerId" = $1 AND "articleId" = $2`,
		fx.AuthorID, fx.ArticleID,
	).Scan(&n); err != nil {
		t.Fatalf("count bookmarks: %v", err)
	}
	if n != 1 {
		t.Fatalf("bookmarks = %d, attendu 1", n)
	}

	// Retrait.
	added, err = svc.ToggleBookmark(ctx, fx.ArticleID, fx.AuthorID)
	if err != nil {
		t.Fatalf("ToggleBookmark(remove): %v", err)
	}
	if added {
		t.Fatal("ToggleBookmark(remove) = true, attendu false")
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Bookmark" WHERE "readerId" = $1 AND "articleId" = $2`,
		fx.AuthorID, fx.ArticleID,
	).Scan(&n); err != nil {
		t.Fatalf("count bookmarks: %v", err)
	}
	if n != 0 {
		t.Fatalf("bookmarks après retrait = %d, attendu 0", n)
	}
}
