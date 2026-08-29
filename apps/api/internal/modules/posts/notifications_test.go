package posts

import (
	"context"
	"testing"
)

func countNotifications(t *testing.T, recipientID, senderID, kind, thoughtID string) int {
	t.Helper()
	var n int
	err := poolTest.QueryRow(context.Background(),
		`SELECT count(*) FROM "Notification" WHERE "recipientId"=$1 AND "senderId"=$2 AND type=$3 AND "thoughtId"=$4`,
		recipientID, senderID, kind, thoughtID).Scan(&n)
	if err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	return n
}

func TestNotifications_MentionAndReply(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	parent := fx.PostID // pensée d'Alice
	reply, err := svc.Reply(ctx, parent, fx.ViewerID, "@alice merci pour ton message !")
	if err != nil {
		t.Fatalf("Reply : %v", err)
	}
	// Les notifications référencent le thoughtId = la réponse elle-même.
	tid := reply.ID

	// REPLY vers Alice (auteure du parent).
	if n := countNotifications(t, fx.AuthorID, fx.ViewerID, "REPLY", tid); n < 1 {
		t.Errorf("REPLY notifications = %d, attendu ≥1", n)
	}
	// MENTION vers Alice (@alice dans le contenu).
	if n := countNotifications(t, fx.AuthorID, fx.ViewerID, "MENTION", tid); n < 1 {
		t.Errorf("MENTION notifications = %d, attendu ≥1", n)
	}
}

func TestNotifications_SelfLikeNoNotification(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Alice like sa propre pensée → pas d'auto-notification.
	if _, err := svc.ToggleLike(ctx, fx.PostID, fx.AuthorID); err != nil {
		t.Fatalf("ToggleLike(self): %v", err)
	}
	if n := countNotifications(t, fx.AuthorID, fx.AuthorID, "LIKE", fx.PostID); n != 0 {
		t.Errorf("auto-LIKE = %d, attendu 0", n)
	}
}

func TestNotifications_NoMentionEarlyReturn(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Réponse sans @mention : pas de notification MENTION.
	parent := fx.PostID
	if _, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content: "réponse sans mention", ParentID: &parent,
	}); err != nil {
		t.Fatalf("CreateFull: %v", err)
	}
	if n := countNotifications(t, fx.AuthorID, fx.ViewerID, "MENTION", parent); n != 0 {
		t.Errorf("MENTION sans @ = %d, attendu 0", n)
	}
}