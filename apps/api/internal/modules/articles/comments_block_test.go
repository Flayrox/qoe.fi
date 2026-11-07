package articles

import (
	"context"
	"testing"
)

// TestComments_BlockedAuthorIsHiddenAndCannotComment vérifie les deux sens :
// le commentaire d'un compte bloqué disparaît de la liste, et le bloqueur ne
// peut plus commenter l'écrit de l'autre.
func TestComments_BlockedAuthorIsHiddenAndCannotComment(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx := seed(t)
	svc := newSvc()
	reader := seedReader(t, ctx)

	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET "allowComments" = true WHERE id = 'art_test_000'`); err != nil {
		t.Fatalf("enable comments: %v", err)
	}

	if _, err := svc.CreateComment(ctx, "art_test_000", fx.AuthorID, "Commentaire de l'auteur", nil); err != nil {
		t.Fatalf("commentaire auteur: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "BlockedUser" (id, "creatorId", "readerId")
		 VALUES ('block_comments_test', $1, $2)`, fx.AuthorID, reader); err != nil {
		t.Fatalf("block: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(),
			`DELETE FROM "BlockedUser" WHERE id = 'block_comments_test'`)
	})

	comments, err := svc.ListComments(ctx, "art_test_000", reader)
	if err != nil {
		t.Fatalf("ListComments: %v", err)
	}
	for _, c := range comments {
		if c.AuthorID == fx.AuthorID {
			t.Fatalf("commentaire d'un compte bloqué visible: %+v", c)
		}
	}

	if _, err := svc.CreateComment(ctx, "art_test_000", reader, "Je contourne le blocage", nil); err == nil {
		t.Fatal("un compte bloqué ne doit pas pouvoir commenter")
	}
}
