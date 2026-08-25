package highlights

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

func newTestService() *Service {
	return NewService(poolTest)
}

// ─── Création & lecture ────────────────────────────────────────────────

func TestCreateAndListHighlights(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	// Création d'un surlignage public par Alice sur l'article seed.
	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage génial sur la lecture", strPtr("À garder"), true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if h.Text != "Passage génial sur la lecture" {
		t.Fatalf("text = %q", h.Text)
	}
	if !h.IsPublic {
		t.Fatal("isPublic = false, attendu true")
	}
	if h.Reader.ID != fx.AuthorID {
		t.Fatalf("reader.id = %q", h.Reader.ID)
	}

	// Listing par article : Bob (viewer) voit le surlignage public.
	items, err := svc.ListByArticle(ctx, fx.ArticleID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ListByArticle: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, attendu 1", len(items))
	}
	if items[0].ID != h.ID {
		t.Fatalf("item.id = %q, attendu %q", items[0].ID, h.ID)
	}
	if items[0].ViewerUpvoted {
		t.Fatal("viewerUpvoted = true avant upvote")
	}
}

func TestCreatePrivateHighlight_VisibleOnlyToOwner(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	if _, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Surlignage privé", nil, false, 0); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Bob (autre viewer) ne voit PAS le surlignage privé.
	items, err := svc.ListByArticle(ctx, fx.ArticleID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ListByArticle: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("items = %d, attendu 0 (privé invisible pour autrui)", len(items))
	}

	// Alice (l'auteure) le voit.
	items, err = svc.ListByArticle(ctx, fx.ArticleID, fx.AuthorID)
	if err != nil {
		t.Fatalf("ListByArticle(owner): %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items(owner) = %d, attendu 1", len(items))
	}
}

// ─── Upvote ────────────────────────────────────────────────────────────

func TestToggleUpvote_AddThenRemove(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage à upvoter", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Bob upvote.
	upvoted, count, err := svc.ToggleUpvote(ctx, h.ID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleUpvote(add): %v", err)
	}
	if !upvoted || count != 1 {
		t.Fatalf("upvote = %v, count = %d, attendu true/1", upvoted, count)
	}

	// Bob retire son upvote.
	upvoted, count, err = svc.ToggleUpvote(ctx, h.ID, fx.ViewerID)
	if err != nil {
		t.Fatalf("ToggleUpvote(remove): %v", err)
	}
	if upvoted || count != 0 {
		t.Fatalf("upvote = %v, count = %d, attendu false/0", upvoted, count)
	}
}

// ─── Commentaires d'annotation ─────────────────────────────────────────

func TestCreateAndListAnnotationComments(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage commenté", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	c, err := svc.CreateComment(ctx, h.ID, fx.ViewerID, "Excellent point !")
	if err != nil {
		t.Fatalf("CreateComment: %v", err)
	}
	if c.Content != "Excellent point !" {
		t.Fatalf("content = %q", c.Content)
	}
	if c.Author.ID != fx.ViewerID {
		t.Fatalf("author.id = %q", c.Author.ID)
	}

	comments, err := svc.ListComments(ctx, h.ID)
	if err != nil {
		t.Fatalf("ListComments: %v", err)
	}
	if len(comments) != 1 {
		t.Fatalf("comments = %d, attendu 1", len(comments))
	}
}

// ─── Bibliothèque : bookmarks & mes surlignages ────────────────────────

func TestBookmarksAndMyHighlights(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	// Alice crée un surlignage + bookmark l'article seed.
	if _, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage sauvegardé", nil, true, 0); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Bookmark" (id, "readerId", "articleId") VALUES (gen_random_uuid()::text, $1, $2)`,
		fx.AuthorID, fx.ArticleID,
	); err != nil {
		t.Fatalf("insert bookmark: %v", err)
	}

	// Mes surlignages.
	mine, err := svc.MyHighlights(ctx, fx.AuthorID, 20, 0)
	if err != nil {
		t.Fatalf("MyHighlights: %v", err)
	}
	if len(mine) != 1 {
		t.Fatalf("my highlights = %d, attendu 1", len(mine))
	}
	if mine[0].ArticleSlug == "" {
		t.Fatal("articleSlug vide")
	}
	if mine[0].PublicationID == "" {
		t.Fatal("publicationId vide — requis pour ouvrir l'article")
	}
}

func strPtr(s string) *string {
	return &s
}

// ─── Suppressions & pagination ─────────────────────────────────────────

func TestDeleteHighlight_OwnerVsOther(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "À supprimer", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Un autre lecteur ne supprime pas (id ne matche pas son readerId).
	deleted, err := svc.Delete(ctx, h.ID, fx.ViewerID)
	if err != nil {
		t.Fatalf("Delete par autrui: %v", err)
	}
	if deleted {
		t.Fatal("suppression par non-propriétaire réussie")
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Highlight" WHERE id = $1`, h.ID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatal("surlignage disparu après tentative par autrui")
	}

	// Le propriétaire supprime.
	deleted, err = svc.Delete(ctx, h.ID, fx.AuthorID)
	if err != nil || !deleted {
		t.Fatalf("Delete owner = %v/%v, attendu true/nil", deleted, err)
	}
}

func TestCreateAndDeleteComment(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage commenté", nil, true, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	c1, err := svc.CreateComment(ctx, h.ID, fx.ViewerID, "D'accord !")
	if err != nil {
		t.Fatalf("CreateComment: %v", err)
	}
	if _, err := svc.CreateComment(ctx, h.ID, fx.AuthorID, "Merci"); err != nil {
		t.Fatalf("CreateComment 2: %v", err)
	}

	comments, err := svc.ListComments(ctx, h.ID)
	if err != nil {
		t.Fatalf("ListComments: %v", err)
	}
	if len(comments) != 2 {
		t.Fatalf("comments = %d, attendu 2", len(comments))
	}

	// Seul l'auteur du commentaire le supprime.
	deleted, err := svc.DeleteComment(ctx, c1.ID, fx.AuthorID)
	if err != nil || deleted {
		t.Fatalf("delete par autrui = %v/%v, attendu false/nil", deleted, err)
	}
	deleted, err = svc.DeleteComment(ctx, c1.ID, fx.ViewerID)
	if err != nil || !deleted {
		t.Fatalf("delete par auteur = %v/%v, attendu true/nil", deleted, err)
	}

	comments, _ = svc.ListComments(ctx, h.ID)
	if len(comments) != 1 {
		t.Fatalf("comments restants = %d, attendu 1", len(comments))
	}
}

func TestMyHighlights_Pagination(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	for _, txt := range []string{"un", "deux", "trois"} {
		if _, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, txt, nil, true, 0); err != nil {
			t.Fatalf("Create %s: %v", txt, err)
		}
	}

	page1, err := svc.MyHighlights(ctx, fx.AuthorID, 2, 0)
	if err != nil {
		t.Fatalf("MyHighlights p1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page 1 = %d items, attendu 2", len(page1))
	}

	page2, err := svc.MyHighlights(ctx, fx.AuthorID, 2, 2)
	if err != nil {
		t.Fatalf("MyHighlights p2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page 2 = %d items, attendu 1", len(page2))
	}

	// Le viewer n'a aucun surlignage.
	mine, _ := svc.MyHighlights(ctx, fx.ViewerID, 10, 0)
	if len(mine) != 0 {
		t.Fatalf("viewer highlights = %d, attendu 0", len(mine))
	}
}
