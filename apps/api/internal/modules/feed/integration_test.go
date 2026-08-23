package feed

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

// vec512 construit un vecteur pgvector de 512 dimensions (parité Article/User/Post).
const vec512 = `('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector`

// seedEngine crée un environnement de feed mixte : 2 auteurs, 2 articles publiés
// et 2 pensées, avec embeddings (pour le chemin personnalisé ANN).
func seedEngine(ctx context.Context, pool *pgxpool.Pool) (readerID string, err error) {
	if _, err = pool.Exec(ctx, `TRUNCATE TABLE
		"Post", "Article", "User", "Publication", "Follows", "BlockedUser",
		"ContentFeedback", "_CoAuthors" CASCADE`); err != nil {
		return "", err
	}
	readerID = "00000000-0000-0000-0000-000000000010"

	// Lecteur (avec embedding) — pour le chemin personnalisé ANN.
	if _, err = pool.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		 VALUES ($1, 'reader@t.dev', 'reader', 'Lecteur', 'user', now(), now(), `+vec512+`)`,
		readerID); err != nil {
		return "", err
	}

	// Deux auteurs.
	for _, u := range []struct{ id, un string }{
		{"00000000-0000-0000-0000-000000000011", "alice"},
		{"00000000-0000-0000-0000-000000000012", "bob"},
	} {
		if _, err = pool.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2||'@t.dev', $2, $2, 'creator', now(), now())`, u.id, u.un); err != nil {
			return "", err
		}
	}

	// Publication unique pour les deux articles (sinon publicationId NOT NULL).
	if _, err = pool.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_engine', 'PERSONAL', 'Eng Pub', 'eng-pub', now(), now())`); err != nil {
		return "", err
	}

	// Deux articles publiés (un par auteur) avec embedding.
	for i, au := range []string{"00000000-0000-0000-0000-000000000011", "00000000-0000-0000-0000-000000000012"} {
		if _, err = pool.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
			                        status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
			 VALUES ($1, $2, $2, $3, true, 'PUBLIC', 8, 'PUBLISHED', 'pub_engine', $4, now(), now(), `+vec512+`)`,
			"eng_art_"+string(rune('a'+i)), "Article "+string(rune('a'+i)), "<p>Corps</p>", au); err != nil {
			return "", err
		}
	}

	// Deux pensées (une par auteur) avec embedding.
	for _, au := range []string{"00000000-0000-0000-0000-000000000011", "00000000-0000-0000-0000-000000000012"} {
		if _, err = pool.Exec(ctx,
			`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			                     visibility, "contentVisibility", "isDraft", "replyRestriction",
			                     "likeCount", "repostCount", "replyCount", embedding)
			 VALUES (gen_random_uuid()::text, 'Pensée moteur', $1, now(), now(), ARRAY[]::text[],
			         'public', 'PUBLIC', false, 'everyone', 0, 0, 0, `+vec512+`)`,
			au); err != nil {
			return "", err
		}
	}

	return readerID, nil
}

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

// TestPersonalizedEngine_ColdStart vérifie le moteur mixte sans vecteur
// utilisateur : retour d'items ARTICLE + THOUGHT, sans erreur.
func TestPersonalizedEngine_ColdStart(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	res, err := svc.PersonalizedEngine(ctx, "", 8, 0, 15)
	if err != nil {
		t.Fatalf("PersonalizedEngine (cold): %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("moteur cold-start ne renvoie aucun item")
	}
	seenArt, seenTh := false, false
	for _, it := range res.Items {
		if it.ID == "" {
			t.Fatal("item sans id")
		}
		if it.ItemType != "ARTICLE" && it.ItemType != "THOUGHT" {
			t.Fatalf("itemType invalide: %q", it.ItemType)
		}
		if it.ItemType == "ARTICLE" {
			seenArt = true
		}
		if it.ItemType == "THOUGHT" {
			seenTh = true
		}
	}
	if !seenArt || !seenTh {
		t.Fatalf("le moteur doit mélanger articles (%v) et pensées (%v)", seenArt, seenTh)
	}
}

// TestPersonalizedEngine_Personalized vérifie le chemin ANN personnalisé
// (vecteur utilisateur + embeddings articles/pensées).
func TestPersonalizedEngine_Personalized(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	res, err := svc.PersonalizedEngine(ctx, readerID, 8, 0, 15)
	if err != nil {
		t.Fatalf("PersonalizedEngine (perso): %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("moteur personnalisé ne renvoie aucun item")
	}
	if res.NextCursor == "" {
		t.Fatal("nextCursor vide attendu non vide")
	}
	ids := map[string]bool{}
	for _, it := range res.Items {
		if ids[it.ID] {
			t.Fatalf("id dupliqué dans le feed: %q", it.ID)
		}
		ids[it.ID] = true
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
