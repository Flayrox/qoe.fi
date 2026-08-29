package feed

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
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

// TestHydrate vérifie la réhydratation Go du feed : articles complets (parité
// publicationProfileSelect : customDomain/logoUrl/heroText/isCertified) +
// pensées FeedSlice, dans l'ordre des ids demandés.
func TestHydrate(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// Récupère les ids classés par le moteur, puis réhydrate.
	res, err := svc.PersonalizedEngine(ctx, readerID, 8, 0, 15)
	if err != nil {
		t.Fatalf("PersonalizedEngine: %v", err)
	}
	if len(res.Items) == 0 {
		t.Fatal("moteur vide, impossible de tester l'hydratation")
	}
	hyd, err := svc.Hydrate(ctx, res.Items, readerID)
	if err != nil {
		t.Fatalf("Hydrate: %v", err)
	}

	seenArt, seenThought := false, false
	for _, it := range res.Items {
		if it.ItemType == "ARTICLE" {
			seenArt = true
			found := false
			for _, a := range hyd.Articles {
				if a.ID == it.ID {
					found = true
					// Parité publicationProfileSelect.
					if a.Publication.ID == "" || a.Publication.Name == "" || a.Publication.Slug == "" {
						t.Fatalf("article %s: publication incomplète %+v", a.ID, a.Publication)
					}
					if a.Publication.Type == "" {
						t.Fatalf("article %s: publication.type vide", a.ID)
					}
					// Les champs optionnels (logoUrl, heroText, customDomain) doivent être
					// PRÉSENTS dans le JSON (null explicite si absents en base), comme Prisma.
					raw, err := json.Marshal(a)
					if err != nil {
						t.Fatalf("json.Marshal: %v", err)
					}
					for _, k := range []string{"logoUrl", "heroText", "customDomain", "subdomain", "isCertified", "imageUrl", "semanticTags", "coAuthors", "attributions"} {
						if !strings.Contains(string(raw), `"`+k+`"`) {
							t.Fatalf("article %s: champ JSON %q absent du contrat d'hydratation", a.ID, k)
						}
					}
					if a.Author.ID == "" || a.Author.Username == nil {
						t.Fatalf("article %s: auteur incomplet %+v", a.ID, a.Author)
					}
					if a.CoAuthors == nil || a.Attributions == nil {
						t.Fatalf("article %s: coAuthors/attributions nil (attendu tableaux)", a.ID)
					}
					if a.Title == "" || a.Content == "" {
						t.Fatalf("article %s: title/content vides", a.ID)
					}
					if a.CreatedAt == "" {
						t.Fatalf("article %s: createdAt vide", a.ID)
					}
				}
			}
			if !found {
				t.Fatalf("article %q absent de la réhydratation", it.ID)
			}
		}
		if it.ItemType == "THOUGHT" {
			seenThought = true
			found := false
			for _, s := range hyd.Thoughts {
				if s.ID == it.ID {
					found = true
					if s.TargetPost.ID == "" {
						t.Fatalf("thought %s: targetPost vide", it.ID)
					}
				}
			}
			if !found {
				t.Fatalf("thought %q absent de la réhydratation", it.ID)
			}
		}
	}
	if !seenArt || !seenThought {
		t.Fatalf("le seed doit contenir articles (%v) et pensées (%v)", seenArt, seenThought)
	}
}

// axisVector construit un vecteur 512-d presque vide (unitaire) avec les
// valeurs indiquées en position idx→val. Utile pour des tests directionnels.
func axisVector(values ...[2]float64) string {
	parts := make([]string, 512)
	for i := range parts {
		parts[i] = "0"
	}
	for _, p := range values {
		parts[int(p[0])] = fmt.Sprintf("%g", p[1])
	}
	return fmt.Sprintf("[%s]", strings.Join(parts, ","))
}

// TestShowMoreBoost vérifie getShowMoreBoost : un contenu « Voir plus »
// (SHOW_MORE) ancre une direction → un candidat proche de l'ancre est boosté
// (sim élevée), un candidat orthogonal ne l'est pas (absent de la map).
func TestShowMoreBoost(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	readerID := "00000000-0000-0000-0000-000000000010"

	// Trois articles supplémentaires à directions contrôlées.
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		VALUES ('boost_anchor', 'Anchor', 'anchor', '<p>a</p>', true, 'PUBLIC', 5, 'PUBLISHED', 'pub_engine', '00000000-0000-0000-0000-000000000011', now(), now(), $1::vector)`, axisVector([2]float64{0, 1})); err != nil {
		t.Fatalf("insert anchor: %v", err)
	}
	// Candidat proche de l'ancre (axe 0) et candidat orthogonal (axe 1).
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		VALUES ('boost_sim', 'Similaire', 'sim', '<p>s</p>', true, 'PUBLIC', 5, 'PUBLISHED', 'pub_engine', '00000000-0000-0000-0000-000000000012', now(), now(), $1::vector)`, axisVector([2]float64{0, 0.95})); err != nil {
		t.Fatalf("insert sim: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		VALUES ('boost_orth', 'Orthogonal', 'orth', '<p>o</p>', true, 'PUBLIC', 5, 'PUBLISHED', 'pub_engine', '00000000-0000-0000-0000-000000000011', now(), now(), $1::vector)`, axisVector([2]float64{1, 1})); err != nil {
		t.Fatalf("insert orth: %v", err)
	}

	// L'utilisateur a félicité l'ancre (« Voir plus »).
	if _, err := poolTest.Exec(ctx, `INSERT INTO "ContentFeedback" (id, "userId", "articleId", type, "createdAt")
		VALUES ('cf_boost', $1::uuid, 'boost_anchor', 'SHOW_MORE', now())`, readerID); err != nil {
		t.Fatalf("insert SHOW_MORE: %v", err)
	}

	boost := svc.getShowMoreBoost(ctx, readerID, []string{"boost_sim", "boost_orth"}, nil)

	sim := boost["boost_sim"]
	if sim < 0.8 {
		t.Fatalf("boost_sim sim = %.2f, attendu ≥ 0.8 (proche de l'ancre)", sim)
	}
	// Le candidat orthogonal à l'ancre ne doit pas être boosté (sim ≈ 0).
	if orth, ok := boost["boost_orth"]; ok && orth > 0.3 {
		t.Fatalf("boost_orth sim = %.2f, attendu ~0 (orthogonal)", orth)
	}

	// Cohérence : un item aussi « Voir moins » est exclu du boost même s'il
	// est sémantiquement proche.
	if _, err := poolTest.Exec(ctx, `INSERT INTO "ContentFeedback" (id, "userId", "articleId", type, "createdAt")
		VALUES ('cf_less', $1::uuid, 'boost_sim', 'SHOW_LESS', now())`, readerID); err != nil {
		t.Fatalf("insert SHOW_LESS: %v", err)
	}
	boost2 := svc.getShowMoreBoost(ctx, readerID, []string{"boost_sim"}, nil)
	if _, ok := boost2["boost_sim"]; ok {
		t.Fatalf("boost_sim exclu via SHOW_LESS mais encore boosté")
	}
}

// seedHomeFeed crée un environnement home : 2 publications certifiées (chacune
// avec 1 article + 1 pensée d'un créateur certifié), le lecteur suit pubA.
func seedHomeFeed(ctx context.Context, pool *pgxpool.Pool) (readerID, pubAID, pubBID string, err error) {
	if _, err = pool.Exec(ctx, `TRUNCATE TABLE
		"Follows", "Bookmark", "Highlight", "MutedWord", "Post", "Article", "User", "Publication", "_CoAuthors" CASCADE`); err != nil {
		return "", "", "", err
	}
	readerID = "00000000-0000-0000-0000-000000000020"
	pubAID = "home_pub_a"
	pubBID = "home_pub_b"

	if _, err = pool.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'reader@h.dev', 'readerh', 'Lecteur', 'user', now(), now())`, readerID); err != nil {
		return "", "", "", err
	}

	for _, pub := range []struct{ id, name, slug string }{
		{pubAID, "Pub A", "pub-a"},
		{pubBID, "Pub B", "pub-b"},
	} {
		if _, err = pool.Exec(ctx,
			`INSERT INTO "Publication" (id, type, name, slug, "isCertified", "createdAt", "updatedAt")
			 VALUES ($1, 'PERSONAL', $2, $3, true, now(), now())`, pub.id, pub.name, pub.slug); err != nil {
			return "", "", "", err
		}
	}

	for i, pub := range []string{pubAID, pubBID} {
		authorID := fmt.Sprintf("00000000-0000-0000-0000-00000000002%d", i+1)
		if _, err = pool.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "isCertified", "publicationId", "createdAt", "updatedAt")
			 VALUES ($1, $2||'@h.dev', $2, $2, 'creator', true, $3, now(), now())`, authorID, "auth"+string(rune('a'+i)), pub); err != nil {
			return "", "", "", err
		}
		if _, err = pool.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
			 VALUES ($1, $2, $2, '<p>Corps</p>', true, 'PUBLIC', 6, 'PUBLISHED', $3, $4, now(), now())`,
			"home_art_"+pub, "Article "+pub, pub, authorID); err != nil {
			return "", "", "", err
		}
		if _, err = pool.Exec(ctx,
			`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			                     visibility, "contentVisibility", "isDraft", "replyRestriction",
			                     "likeCount", "repostCount", "replyCount")
			 VALUES (gen_random_uuid()::text, 'Pensée home '||$2, $1, now(), now(), ARRAY[]::text[],
			         'public', 'PUBLIC', false, 'everyone', 0, 0, 0)`, authorID, pub); err != nil {
			return "", "", "", err
		}
	}

	// Le lecteur suit la publication A.
	if _, err = pool.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, now())`, readerID, pubAID); err != nil {
		return "", "", "", err
	}
	return readerID, pubAID, pubBID, nil
}

// TestHomeFeed vérifie le bundle de la home : Suivis = pub suivie, Explorer =
// pubs certifiées non suivies, créateurs suivis, compteurs et mots masqués.
func TestHomeFeed(t *testing.T) {
	ctx := context.Background()
	readerID, pubAID, pubBID, err := seedHomeFeed(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	res, err := svc.HomeFeed(ctx, readerID)
	if err != nil {
		t.Fatalf("HomeFeed: %v", err)
	}

	// Créateurs suivis : la publication A, avec son propriétaire créateur.
	if len(res.FollowedCreators) != 1 || res.FollowedCreators[0].ID != pubAID {
		t.Fatalf("FollowedCreators = %+v, attendu [%s]", res.FollowedCreators, pubAID)
	}
	if len(res.FollowedUserIDs) != 1 {
		t.Fatalf("FollowedUserIDs = %v, attendu 1 propriétaire PERSONAL", res.FollowedUserIDs)
	}

	// Suivis : l'article et la pensée de la publication A.
	if len(res.Following.Articles) != 1 || res.Following.Articles[0].ID != "home_art_"+pubAID {
		t.Fatalf("Following.Articles = %+v, attendu article de %s", res.Following.Articles, pubAID)
	}
	if len(res.Following.Thoughts) != 1 {
		t.Fatalf("Following.Thoughts = %d, attendu 1 pensée de %s", len(res.Following.Thoughts), pubAID)
	}

	// Explorer : uniquement la publication B (certifiée, non suivie).
	if len(res.Discover.Articles) != 1 || res.Discover.Articles[0].ID != "home_art_"+pubBID {
		t.Fatalf("Discover.Articles = %+v, attendu article de %s", res.Discover.Articles, pubBID)
	}

	// Recommandé : les deux articles.
	if len(res.Recommended.Articles) != 2 {
		t.Fatalf("Recommended.Articles = %d, attendu 2", len(res.Recommended.Articles))
	}

	// Compteurs + mots masqués.
	if res.HighlightsCount != 0 || len(res.Bookmarks) != 0 {
		t.Fatalf("bookmarks/highlights attendus vides, got %d/%d", len(res.Bookmarks), res.HighlightsCount)
	}
	if len(res.ActivityData) != 7 {
		t.Fatalf("ActivityData = %d cases, attendu 7", len(res.ActivityData))
	}
	if res.FeaturedArticle == nil {
		t.Fatal("FeaturedArticle nil, attendu un article")
	}

	// Anonyme : pas de Suivis ni de bibliothèque, mais Explorer rempli.
	anon, err := svc.HomeFeed(ctx, "")
	if err != nil {
		t.Fatalf("HomeFeed(anon): %v", err)
	}
	if len(anon.FollowedCreators) != 0 || len(anon.Bookmarks) != 0 {
		t.Fatalf("anonyme ne doit pas avoir de suivis/bookmarks")
	}
	if len(anon.Discover.Articles) != 2 {
		t.Fatalf("anonyme Discover.Articles = %d, attendu 2", len(anon.Discover.Articles))
	}

	// Utilisateur connecté sans aucun follow : les tableaux restent vides
	// non-nil (jamais null en JSON) pour ne pas casser .map()/.includes().
	noFollowID := "00000000-0000-0000-0000-000000000099"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'nofollow@h.dev', 'nofollowh', 'No Follow', 'user', now(), now())`, noFollowID); err != nil {
		t.Fatalf("insert no-follow reader: %v", err)
	}
	nf, err := svc.HomeFeed(ctx, noFollowID)
	if err != nil {
		t.Fatalf("HomeFeed(noFollow): %v", err)
	}
	if nf.FollowedCreators == nil || nf.FollowedUserIDs == nil {
		t.Fatalf("followedCreators/followedUserIds doivent être des tableaux vides non-nil, got %#v / %#v", nf.FollowedCreators, nf.FollowedUserIDs)
	}
	if len(nf.FollowedCreators) != 0 || len(nf.FollowedUserIDs) != 0 {
		t.Fatalf("no-follow reader ne doit avoir aucun suivi, got %d/%d", len(nf.FollowedCreators), len(nf.FollowedUserIDs))
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
