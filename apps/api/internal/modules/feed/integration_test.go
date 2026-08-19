package feed

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
	return NewService(poolTest, nil)
}

// TestThread_AncestorChain vérifie que la chaîne d'ancêtres (root → parent)
// est bien peuplée dans `Parent` quand on charge le thread d'une réponse.
func TestThread_AncestorChain(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	ctx := context.Background()

	// Crée une réponse (Bob → pensée d'Alice).
	var replyID string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt",
		                    visibility, "contentVisibility", "isDraft", "replyRestriction",
		                    "likeCount", "repostCount", "replyCount", "parentId", "rootId")
		 VALUES ('post_test_reply', 'Réponse de Bob', $1, now(), now(),
		         'public', 'PUBLIC', false, 'everyone', 0, 0, 0, $2, $2)
		 RETURNING id`,
		fx.ViewerID, fx.PostID,
	).Scan(&replyID); err != nil {
		t.Fatalf("insert reply: %v", err)
	}
	if replyID == "" {
		t.Fatal("replyID vide")
	}

	svc := newTestService()
	thread, err := svc.Thread(ctx, replyID, fx.AuthorID)
	if err != nil {
		t.Fatalf("Thread: %v", err)
	}
	if thread.ID != replyID {
		t.Fatalf("thread.id = %q, attendu %q", thread.ID, replyID)
	}
	// La réponse doit avoir son parent (la pensée d'Alice) chaîné.
	if thread.Parent == nil {
		t.Fatal("thread.Parent est nil, attendu la chaîne d'ancêtres")
	}
	if thread.Parent.ID != fx.PostID {
		t.Fatalf("thread.Parent.id = %q, attendu %q", thread.Parent.ID, fx.PostID)
	}
	// La racine (Alice) n'a pas de parent.
	if thread.Parent.Parent != nil {
		t.Fatalf("thread.Parent.Parent = %+v, attendu nil", thread.Parent.Parent)
	}
}

// TestPublicationArticles vérifie que les articles d'une publication (profil)
// sont listés par slug (insensible à la casse) avec le même shape que le feed.
func TestPublicationArticles(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	svc := newTestService()
	res, err := svc.PublicationArticles(context.Background(), "PUBLICATION-TEST", 20, 0)
	if err != nil {
		t.Fatalf("PublicationArticles: %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("PublicationArticles ne renvoie aucun article")
	}
	found := false
	for _, a := range res.Items {
		if a.ID == fx.ArticleID {
			found = true
			if a.Title != "Article bookmarké" {
				t.Fatalf("title = %q", a.Title)
			}
			if a.Author.Username == nil || *a.Author.Username != "alice" {
				t.Fatalf("author = %+v", a.Author)
			}
			if a.PublicationID == "" {
				t.Fatal("publicationId vide")
			}
		}
	}
	if !found {
		t.Fatalf("article %q absent des articles de la publication", fx.ArticleID)
	}
}

// TestRecentArticles vérifie que le feed d'articles renvoie l'article publié
// seedé avec auteur/publication/catégorie dénormalisés.
func TestRecentArticles(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	svc := newTestService()
	res, err := svc.RecentArticles(context.Background(), 20, 0)
	if err != nil {
		t.Fatalf("RecentArticles: %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("RecentArticles ne renvoie aucun article")
	}
	found := false
	for _, a := range res.Items {
		if a.ID == fx.ArticleID {
			found = true
			if a.Title != "Article bookmarké" {
				t.Fatalf("title = %q", a.Title)
			}
			if a.Author.Username == nil || *a.Author.Username != "alice" {
				t.Fatalf("author = %+v", a.Author)
			}
			if a.Publication.Name != "Publication Test" {
				t.Fatalf("publication = %+v", a.Publication)
			}
			if a.PublicationID == "" {
				t.Fatal("publicationId vide")
			}
		}
	}
	if !found {
		t.Fatalf("article %q absent du feed", fx.ArticleID)
	}
}
