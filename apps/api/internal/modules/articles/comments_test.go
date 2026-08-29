package articles

import (
	"context"
	"testing"

)

func newSvc() *Service {
	return NewService(poolTest, nil, nil)
}

// seedReader ajoute un second lecteur (pour commenter sans être l'auteur).
func seedReader(t *testing.T, ctx context.Context) string {
	t.Helper()
	id := "00000000-0000-0000-0000-000000000009"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'reader@t.dev', 'reader9', 'Lecteur', 'user', now(), now())
		 ON CONFLICT (id) DO NOTHING`, id); err != nil {
		t.Fatalf("reader: %v", err)
	}
	return id
}

func TestComments_CreateListDelete(t *testing.T) {
	ctx := context.Background()
	fx := seed(t) // seed() existe dans integration_test.go
	svc := newSvc()
	reader := seedReader(t, ctx)

	// Création d'un commentaire par un lecteur → l'auteur est notifié (POST non vide).
	comment, err := svc.CreateComment(ctx, "art_test_000", reader, "Très bon article !", nil)
	if err != nil {
		t.Fatalf("CreateComment: %v", err)
	}
	if comment.ID == "" || comment.AuthorID != reader || comment.ArticleID != "art_test_000" {
		t.Fatalf("comment = %+v", comment)
	}
	// Notification COMMENT vers l'auteur.
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Notification" WHERE "recipientId"=$1::uuid AND "senderId"=$2::uuid AND type='COMMENT'`,
		fx.AuthorID, reader).Scan(&n); err != nil || n < 1 {
		t.Fatalf("notification comment = %d (err=%v), attendu ≥1", n, err)
	}

	// Réponse au commentaire (parentId) → notification vers l'auteur du parent.
	reply, err := svc.CreateComment(ctx, "art_test_000", fx.AuthorID, "Merci !", &comment.ID)
	if err != nil {
		t.Fatalf("CreateComment(reply): %v", err)
	}
	if reply.ParentID == nil || *reply.ParentID != comment.ID {
		t.Fatalf("reply.ParentId = %v", reply.ParentID)
	}

	// List.
	all, err := svc.ListComments(ctx, "art_test_000")
	if err != nil {
		t.Fatalf("ListComments: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("comments = %d, attendu 2", len(all))
	}

	// Delete par l'auteur du commentaire (reader) ✓.
	if err := svc.DeleteComment(ctx, comment.ID, reader); err != nil {
		t.Fatalf("DeleteComment: %v", err)
	}
	// Supprimer la réponse par un non-auteur (reader) → forbidden.
	if err := svc.DeleteComment(ctx, reply.ID, reader); err == nil {
		t.Fatal("delete par un non-auteur doit être interdit")
	}
	// Supprimer un commentaire inexistant → not found.
	if err := svc.DeleteComment(ctx, "commentaire_x", fx.AuthorID); err == nil {
		t.Fatal("delete d'un commentaire inexistant doit échouer")
	}
}

func TestComments_Disabled(t *testing.T) {
	ctx := context.Background()
	seed(t)
	svc := newSvc()
	reader := seedReader(t, ctx)

	// Désactive les commentaires sur l'article.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET "allowComments" = false WHERE id='art_test_000'`); err != nil {
		t.Fatalf("disable comments: %v", err)
	}
	if _, err := svc.CreateComment(ctx, "art_test_000", reader, "coucou", nil); err == nil {
		t.Fatal("les commentaires désactivés doivent être refusés")
	}
}

func TestComments_ArticleNotFound(t *testing.T) {
	seed(t)
	svc := newSvc()
	reader := seedReader(t, context.Background())
	if _, err := svc.CreateComment(context.Background(), "art_absente", reader, "x", nil); err == nil {
		t.Fatal("article inexistant doit échouer (not found)")
	}
}

// TestCommentMentionsOwnArticlePasDeNotif couvre l'early-return du notify.
func TestComment_OwnArticleNoNotification(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc := newSvc()

	// L'auteur commente son propre article → reconnoit, mais pas de notification.
	if _, err := svc.CreateComment(ctx, "art_test_000", fx.AuthorID, "actualité", nil); err != nil {
		t.Fatalf("CreateComment(self): %v", err)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Notification" WHERE "recipientId"=$1::uuid AND "senderId"=$1::uuid`,
		fx.AuthorID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("auto-notification = %d, attendu 0", n)
	}
}