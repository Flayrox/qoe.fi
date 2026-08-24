package notifications

import (
	"context"
	"log"
	"os"
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

// insertNotification helper : insertion brute pour préparer les états.
func insertNotification(t *testing.T, recipientID, senderID, ntype, thoughtID string, isRead bool) {
	t.Helper()
	var thought *string
	if thoughtID != "" {
		thought = &thoughtID
	}
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId", "isRead")
		 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
		recipientID, senderID, ntype, thought, isRead); err != nil {
		t.Fatalf("insert notification: %v", err)
	}
}

// ─── Liste & groupement ────────────────────────────────────────────────

func TestListEmpty(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)

	res, err := svc.List(context.Background(), fx.ViewerID, "", 30, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(res.Notifications) != 0 {
		t.Fatalf("notifications = %d, attendu 0", len(res.Notifications))
	}
	if res.NextCursor != "" {
		t.Fatalf("nextCursor = %q, attendu vide", res.NextCursor)
	}
}

func TestListGroupsSameTargetWithin48h(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)

	// 2 likes sur la même pensée (senders distincts) → 1 groupe TotalCount=2.
	insertNotification(t, fx.AuthorID, fx.ViewerID, "LIKE", fx.PostID, false)
	insertNotification(t, fx.AuthorID, fx.AuthorID, "LIKE", fx.PostID, false)
	// 1 like sur une autre pensée → groupe séparé.
	insertNotification(t, fx.AuthorID, fx.ViewerID, "LIKE", fx.Post2ID, true)

	res, err := svc.List(context.Background(), fx.AuthorID, "likes", 30, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(res.Notifications) != 2 {
		t.Fatalf("groupes = %d, attendu 2", len(res.Notifications))
	}

	// L'ordre des groupes dépend du tri SQL : on identifie par pensée.
	byThought := map[string]Notification{}
	for _, n := range res.Notifications {
		if n.Thought == nil {
			t.Fatal("groupe sans référence pensée")
		}
		byThought[n.Thought.ID] = n
	}
	grouped, ok := byThought[fx.PostID]
	if !ok {
		t.Fatal("groupe du PostID absent")
	}
	if grouped.TotalCount != 2 || len(grouped.Senders) != 2 {
		t.Fatalf("groupe PostID = total=%d senders=%d ; attendu 2/2",
			grouped.TotalCount, len(grouped.Senders))
	}
	if grouped.IsRead {
		t.Fatal("groupe avec une non-lue marqué lu")
	}

	single, ok := byThought[fx.Post2ID]
	if !ok {
		t.Fatal("groupe du Post2ID absent")
	}
	if !single.IsRead || single.TotalCount != 1 {
		t.Fatalf("groupe Post2ID = isRead=%v total=%d ; attendu lu/1", single.IsRead, single.TotalCount)
	}
}

func TestListTypeFilters(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)

	insertNotification(t, fx.AuthorID, fx.ViewerID, "MENTION", fx.PostID, false)
	insertNotification(t, fx.AuthorID, fx.ViewerID, "REPLY", fx.PostID, false)
	insertNotification(t, fx.AuthorID, fx.ViewerID, "FOLLOW", "", false)

	// mentions → seulement MENTION.
	res, err := svc.List(context.Background(), fx.AuthorID, "mentions", 30, 0)
	if err != nil {
		t.Fatalf("List mentions: %v", err)
	}
	if len(res.Notifications) != 1 || res.Notifications[0].Type != "MENTION" {
		t.Fatalf("mentions = %d items, attendu 1 MENTION", len(res.Notifications))
	}

	// replies → REPLY et COMMENT (pas LIKE/FOLLOW).
	insertNotification(t, fx.AuthorID, fx.ViewerID, "COMMENT", fx.Post2ID, false)
	res, err = svc.List(context.Background(), fx.AuthorID, "replies", 30, 0)
	if err != nil {
		t.Fatalf("List replies: %v", err)
	}
	if len(res.Notifications) != 2 {
		t.Fatalf("replies = %d groupes, attendu 2 (REPLY + COMMENT)", len(res.Notifications))
	}

	// Filtre inconnu → tout.
	res, err = svc.List(context.Background(), fx.AuthorID, "inconnu", 30, 0)
	if err != nil {
		t.Fatalf("List all: %v", err)
	}
	if len(res.Notifications) < 3 {
		t.Fatalf("sans filtre = %d groupes, attendu >= 3", len(res.Notifications))
	}
}

func TestListPaginationHasMoreAndCursor(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)

	for i := 0; i < 5; i++ {
		insertNotification(t, fx.ViewerID, fx.AuthorID, "FOLLOW", "", false)
	}

	// limit=2 → 2 items + nextCursor.
	res, err := svc.List(context.Background(), fx.ViewerID, "", 2, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(res.Notifications) != 2 || res.NextCursor != "2" {
		t.Fatalf("page 1 = %d items cursor=%q ; attendu 2/2", len(res.Notifications), res.NextCursor)
	}

	// Page suivante depuis le curseur.
	res, err = svc.List(context.Background(), fx.ViewerID, "", 2, 2)
	if err != nil {
		t.Fatalf("List page 2: %v", err)
	}
	if len(res.Notifications) != 2 {
		t.Fatalf("page 2 = %d items, attendu 2", len(res.Notifications))
	}
}

// ─── Non-lues & lecture ────────────────────────────────────────────────

func TestUnreadCountAndMarkRead(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)
	ctx := context.Background()

	insertNotification(t, fx.ViewerID, fx.AuthorID, "FOLLOW", "", false)
	insertNotification(t, fx.ViewerID, fx.AuthorID, "MENTION", fx.PostID, false)
	insertNotification(t, fx.ViewerID, fx.AuthorID, "REPOST", fx.PostID, true)

	count, err := svc.UnreadCount(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("UnreadCount: %v", err)
	}
	if count != 2 {
		t.Fatalf("unread = %d, attendu 2", count)
	}

	// Marquer UNE notification lue : -1.
	rows, err := poolTest.Query(ctx,
		`SELECT id FROM "Notification" WHERE "recipientId" = $1 AND type = 'FOLLOW'`, fx.ViewerID)
	if err != nil {
		t.Fatalf("select ids: %v", err)
	}
	defer rows.Close()
	var followID string
	if rows.Next() {
		if err := rows.Scan(&followID); err != nil {
			t.Fatalf("scan: %v", err)
		}
	}
	if err := svc.MarkRead(ctx, fx.ViewerID, []string{followID}); err != nil {
		t.Fatalf("MarkRead ids: %v", err)
	}
	count, _ = svc.UnreadCount(ctx, fx.ViewerID)
	if count != 1 {
		t.Fatalf("après MarkRead ciblé unread = %d, attendu 1", count)
	}

	// ids vides → TOUT marquer lu.
	if err := svc.MarkRead(ctx, fx.ViewerID, []string{}); err != nil {
		t.Fatalf("MarkRead all: %v", err)
	}
	count, _ = svc.UnreadCount(ctx, fx.ViewerID)
	if count != 0 {
		t.Fatalf("après MarkRead global unread = %d, attendu 0", count)
	}
}

// ─── Préférences ───────────────────────────────────────────────────────

func TestPreferencesDefaultsThenPartialUpdate(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)
	ctx := context.Background()

	// Aucune ligne → tous les défauts à true.
	prefs, err := svc.GetPreferences(ctx, fx.AuthorID)
	if err != nil {
		t.Fatalf("GetPreferences: %v", err)
	}
	if !prefs.EmailLikes || !prefs.PushMedia || !prefs.EmailFollows {
		t.Fatalf("défauts incorrects : %+v", prefs)
	}

	// Merge partiel : seul pushLikes change, le reste est préservé.
	updated, err := svc.UpdatePreferences(ctx, fx.AuthorID, map[string]bool{"pushLikes": false})
	if err != nil {
		t.Fatalf("UpdatePreferences: %v", err)
	}
	if updated.PushLikes {
		t.Fatal("pushLikes devrait être false")
	}
	if !updated.EmailLikes || !updated.PushMedia {
		t.Fatalf("merge partiel a écrasé les autres champs : %+v", updated)
	}

	// Persisté : relecture depuis la base.
	reloaded, err := svc.GetPreferences(ctx, fx.AuthorID)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if reloaded.PushLikes {
		t.Fatal("pushLikes=false non persisté")
	}
}

// ─── Notifications média ───────────────────────────────────────────────

func TestInsertMediaInviteAndMemberJoined(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := NewService(poolTest)
	ctx := context.Background()

	// La FK Notification.publicationId exige une publication réelle.
	var pubID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "publicationId" FROM "User" WHERE id = $1`, fx.AuthorID,
	).Scan(&pubID); err != nil {
		t.Fatalf("publication de l'auteur: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = NULL WHERE id = $1`,
		fx.ViewerID); err != nil {
		t.Fatalf("detach publication: %v", err)
	}

	if err := svc.InsertMediaInvite(ctx, fx.ViewerID, fx.AuthorID, pubID); err != nil {
		t.Fatalf("InsertMediaInvite: %v", err)
	}
	if err := svc.InsertMediaMemberJoined(ctx, fx.ViewerID, fx.AuthorID, pubID); err != nil {
		t.Fatalf("InsertMediaMemberJoined: %v", err)
	}

	res, err := svc.List(ctx, fx.ViewerID, "", 30, 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	types := map[string]bool{}
	for _, n := range res.Notifications {
		types[n.Type] = true
		if n.Publication == nil || n.Publication.ID != pubID {
			t.Fatalf("notification %s sans référence publication", n.Type)
		}
	}
	if !types["MEDIA_INVITE"] || !types["MEDIA_MEMBER_JOINED"] {
		t.Fatalf("types manquants : %v", types)
	}

	// UnreadCount compte ces nouvelles notifications.
	count, err := svc.UnreadCount(ctx, fx.ViewerID)
	if err != nil {
		t.Fatalf("UnreadCount: %v", err)
	}
	if count < 2 {
		t.Fatalf("unread = %d, attendu >= 2", count)
	}
}

// ─── Helpers purs ──────────────────────────────────────────────────────

func TestWithin48h(t *testing.T) {
	base := "2026-08-24T12:00:00Z"
	if !within48h(base, "2026-08-23T12:00:00Z") {
		t.Fatal("23h d'écart doit être dans la fenêtre")
	}
	if within48h(base, "2026-08-20T12:00:00Z") {
		t.Fatal("96h d'écart doit être hors fenêtre")
	}
	if within48h(base, "pas-une-date") {
		t.Fatal("date invalide doit renvoyer false")
	}
}

func TestItoa(t *testing.T) {
	cases := map[int]string{0: "0", 7: "7", 42: "42", 123456: "123456"}
	for in, want := range cases {
		if got := itoa(in); got != want {
			t.Errorf("itoa(%d) = %q, want %q", in, got, want)
		}
	}
}
