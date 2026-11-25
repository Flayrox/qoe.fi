package articles

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/modules/posts"
)

func newSvc() *Service {
	return NewService(poolTest, nil, nil)
}

// seedReader ajoute un second lecteur (pour commenter sans être l'auteur).
func seedReader(t *testing.T, ctx context.Context) string {
	requirePool(t)
	t.Helper()
	id := "00000000-0000-0000-0000-000000000009"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'reader@t.dev', 'reader9', 'Lecteur', 'user', now(), now())
		 ON CONFLICT (id) DO NOTHING`, id); err != nil {
		t.Fatalf("reader: %v", err)
	}
	// Droits remis à zéro : ce lecteur doit partir SANS Plus (les tests
	// hors-ligne mesurent justement ce refus). L'id est fixe et partagé entre
	// paquets comme entre exécutions : en base partagée (mode CI), un octroi
	// laissé par un test interrompu le rendrait « déjà Plus » et le refus ne
	// serait plus testé du tout.
	if _, err := poolTest.Exec(ctx, `
		DELETE FROM "SubscriptionGrant"
		WHERE ("subjectType" = 'user' AND "subjectId" = $1::text)
		   OR ("subjectType" = 'publisher'
		       AND "subjectId" = (SELECT u."publisherId" FROM "User" u WHERE u.id = $2::uuid))`,
		id, id); err != nil {
		t.Fatalf("droits lecteur: %v", err)
	}
	return id
}

func TestComments_CreateListDelete(t *testing.T) {
	requirePool(t)
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

	// Liste : les commentaires de niveau 1 forment la page de l'article, la
	// réponse vit dans le fil du commentaire (même pagination).
	page, err := svc.ListCommentsPage(ctx, "art_test_000", "", "", 20)
	if err != nil {
		t.Fatalf("ListCommentsPage: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != comment.ID {
		t.Fatalf("racines = %+v, attendu [%s]", page.Items, comment.ID)
	}
	if page.Items[0].ReplyCount != 1 {
		t.Fatalf("replyCount racine = %d, attendu 1", page.Items[0].ReplyCount)
	}
	replies, err := posts.ReplyPageFor(ctx, svc.q, posts.ReplyScopeChildren, comment.ID, "", "", "", "", 20)
	if err != nil {
		t.Fatalf("réponses: %v", err)
	}
	if len(replies.Items) != 1 || replies.Items[0].ID != reply.ID || replies.Items[0].Tombstone {
		t.Fatalf("r\u00e9ponses = %+v, attendu [%s]", replies.Items, reply.ID)
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

	// Tombstone : la racine reste dans la page (structure + compteur), sans
	// contenu ni auteur, et la réponse reste atteignable dessous.
	after, err := svc.ListCommentsPage(ctx, "art_test_000", "", "", 20)
	if err != nil {
		t.Fatalf("page après suppression: %v", err)
	}
	if len(after.Items) != 1 || !after.Items[0].Tombstone {
		t.Fatalf("tombstone attendu, obtenu %+v", after.Items)
	}
	if after.Items[0].Content != "" || after.Items[0].Author != nil {
		t.Fatalf("un tombstone ne doit rien révéler: %+v", after.Items[0])
	}
	orphans, err := posts.ReplyPageFor(ctx, svc.q, posts.ReplyScopeChildren, comment.ID, "", "", "", "", 20)
	if err != nil {
		t.Fatalf("réponses après suppression: %v", err)
	}
	if len(orphans.Items) != 1 || orphans.Items[0].ID != reply.ID {
		t.Fatalf("enfant d'un tombstone perdu: %+v", orphans.Items)
	}
}

// Le total ne dépend pas de la page : une racine supprimée garde sa place
// (tombstone) et reste comptée, tandis qu'une page suivante continue de
// renvoyer le même total. C'est l'en-tête « Discussion (n) » qui l'affiche.
func TestCommentsPage_TotalCountAcrossPages(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seed(t)
	svc := newSvc()
	reader := seedReader(t, ctx)

	ids := make([]string, 0, 3)
	for _, text := range []string{"un", "deux", "trois"} {
		comment, err := svc.CreateComment(ctx, "art_test_000", reader, text, nil)
		if err != nil {
			t.Fatalf("CreateComment(%s): %v", text, err)
		}
		ids = append(ids, comment.ID)
	}
	if err := svc.DeleteComment(ctx, ids[2], reader); err != nil {
		t.Fatalf("DeleteComment: %v", err)
	}

	first, err := svc.ListCommentsPage(ctx, "art_test_000", "", "", 2)
	if err != nil {
		t.Fatalf("première page: %v", err)
	}
	if len(first.Items) != 2 || !first.HasMore || first.NextCursor == "" {
		t.Fatalf("première page = %d items, hasMore=%v, cursor=%q", len(first.Items), first.HasMore, first.NextCursor)
	}
	if first.TotalCount != 3 {
		t.Fatalf("total première page = %d, attendu 3 (tombstone compris)", first.TotalCount)
	}

	second, err := svc.ListCommentsPage(ctx, "art_test_000", "", first.NextCursor, 2)
	if err != nil {
		t.Fatalf("seconde page: %v", err)
	}
	if len(second.Items) != 1 || second.HasMore {
		t.Fatalf("seconde page = %d items, hasMore=%v", len(second.Items), second.HasMore)
	}
	if second.TotalCount != 3 {
		t.Fatalf("total seconde page = %d, attendu 3", second.TotalCount)
	}
	if !second.Items[0].Tombstone {
		t.Fatalf("la racine supprimée doit rester une place (tombstone), obtenu %+v", second.Items[0])
	}
}

// Le trigger de 00106 répare une écriture legacy qui omet rootId et
// rootArticleId : le fil `scope=thread` doit retrouver l'enfant. Sans le
// trigger, l'enfant a rootId NULL et n'apparaît jamais dans le fil.
func TestThreadScope_TriggerBackfillsMissingRoot(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seed(t)
	svc := newSvc()
	reader := seedReader(t, ctx)

	root, err := svc.CreateComment(ctx, "art_test_000", reader, "racine", nil)
	if err != nil {
		t.Fatalf("CreateComment(racine): %v", err)
	}
	const childID = "comment_legacy_child"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", "parentId")
		 VALUES ($1, 'enfant legacy', $2, now(), now(), $3)`,
		childID, reader, root.ID); err != nil {
		t.Fatalf("insert enfant legacy: %v", err)
	}

	var rootID, articleID *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "rootId", "rootArticleId" FROM "Post" WHERE id = $1`, childID).
		Scan(&rootID, &articleID); err != nil {
		t.Fatalf("relire enfant: %v", err)
	}
	if rootID == nil || *rootID != root.ID {
		t.Fatalf("rootId réparé = %v, attendu %s", rootID, root.ID)
	}
	if articleID == nil || *articleID != "art_test_000" {
		t.Fatalf("rootArticleId réparé = %v, attendu art_test_000", articleID)
	}

	page, err := posts.ReplyPageFor(ctx, svc.q, posts.ReplyScopeThread, "", root.ID, "", "", "", 20)
	if err != nil {
		t.Fatalf("fil thread: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].ID != childID {
		t.Fatalf("fil thread = %+v, attendu [%s]", page.Items, childID)
	}
}

func TestComments_Disabled(t *testing.T) {
	requirePool(t)
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
	requirePool(t)
	seed(t)
	svc := newSvc()
	reader := seedReader(t, context.Background())
	if _, err := svc.CreateComment(context.Background(), "art_absente", reader, "x", nil); err == nil {
		t.Fatal("article inexistant doit échouer (not found)")
	}
}

// TestCommentMentionsOwnArticlePasDeNotif couvre l'early-return du notify.
func TestComment_OwnArticleNoNotification(t *testing.T) {
	requirePool(t)
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
