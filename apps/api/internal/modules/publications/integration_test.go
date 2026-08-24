package publications

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

func seedPublication(t *testing.T) (pubID, userID, articleID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Follows", "Subscriber", "Bookmark", "ArticleAttribution", "Article",
		"Category", "NavigationItem", "SocialLink", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	userID = "00000000-0000-0000-0000-0000000000e1"
	readerID := "00000000-0000-0000-0000-0000000000e2"
	pubID = "pub_tenant_test"
	for _, u := range []struct{ id, email, username string }{
		{userID, "tenant.owner@test.dev", "tenantowner"},
		{readerID, "tenant.reader@test.dev", "tenantreader"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.email, u.username); err != nil {
			t.Fatalf("user: %v", err)
		}
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, subdomain, "accentColor", "layoutStyle", "updatedAt")
		VALUES ($1, 'PERSONAL', 'Tenant Test', 'tenant-test', 'tenant', '#c5a880', 'minimal', now())`,
		pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $1 WHERE id = $2`, pubID, userID); err != nil {
		t.Fatalf("link: %v", err)
	}
	// Navigation + socials + catégorie + article publié.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publicationId")
		VALUES (gen_random_uuid()::text, 'Accueil', '/', 1, false, $1)`, pubID); err != nil {
		t.Fatalf("nav: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SocialLink" (id, platform, url, "order", "publicationId")
		VALUES (gen_random_uuid()::text, 'x', 'https://x.com/tenant', 1, $1)`, pubID); err != nil {
		t.Fatalf("social: %v", err)
	}
	var catID string
	if err := poolTest.QueryRow(ctx, `
		INSERT INTO "Category" (id, name, slug, "publicationId")
		VALUES (gen_random_uuid()::text, 'Écologie', 'ecologie', $1) RETURNING id`,
		pubID).Scan(&catID); err != nil {
		t.Fatalf("category: %v", err)
	}
	articleID = "article_tenant_1"
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility, "readingTime", "publicationId", "authorId", "categoryId", "createdAt", "updatedAt")
		VALUES ($1, 'Article Tenant', 'article-tenant', '<p>Contenu</p>', true, false, 'PUBLIC', 3, $2, $3, $4, now(), now())`,
		articleID, pubID, userID, catID); err != nil {
		t.Fatalf("article: %v", err)
	}
	// Interaction du lecteur : bookmark + follow.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Bookmark" (id, "articleId", "readerId", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, now())`, articleID, readerID); err != nil {
		t.Fatalf("bookmark: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		VALUES (gen_random_uuid()::text, $2, $1, now())`, pubID, readerID); err != nil {
		t.Fatalf("follow: %v", err)
	}
	// Abonné premium du lecteur.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "isPremium", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, 'tenant.reader@test.dev', $1, true, true, now(), now())`,
		pubID); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	return pubID, userID, articleID
}

func TestPublicationsByDomain(t *testing.T) {
	pubID, _, _ := seedPublication(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	pub, err := svc.ByDomain(ctx, "tenant")
	if err != nil {
		t.Fatalf("ByDomain: %v", err)
	}
	if pub.ID != pubID {
		t.Fatalf("pub.ID = %s, attendu %s", pub.ID, pubID)
	}
	if pub.User == nil || pub.User.ID == "" {
		t.Fatal("pub.User attendu (propriétaire de la publication)")
	}
	if len(pub.Navigation) != 1 || len(pub.SocialLinks) != 1 {
		t.Fatalf("nav/socials = %d/%d, attendu 1/1", len(pub.Navigation), len(pub.SocialLinks))
	}
	if len(pub.Articles) != 1 || pub.Articles[0].Category == nil {
		t.Fatalf("articles = %d (category attendue), articles[0].Category = %v",
			len(pub.Articles), pub.Articles[0].Category)
	}

	// Résolution par domaine personnalisé (insensible à la casse).
	if _, err := svc.ByDomain(ctx, "TENANT"); err != nil {
		t.Fatalf("ByDomain casse: %v", err)
	}
	// Inconnu → 404.
	if _, err := svc.ByDomain(ctx, "introuvable"); err == nil {
		t.Fatal("ByDomain attendu errNotFound")
	}
}

func TestPublicationsArticleBundle(t *testing.T) {
	_, userID, articleID := seedPublication(t)
	svc := NewService(poolTest)
	ctx := context.Background()
	readerID := "00000000-0000-0000-0000-0000000000e2"

	bundle, err := svc.Article(ctx, "tenant", "ARTICLE-TENANT", readerID, "tenant.reader@test.dev")
	if err != nil {
		t.Fatalf("Article: %v", err)
	}
	if bundle.Article.ID != articleID {
		t.Fatalf("article.ID = %s, attendu %s", bundle.Article.ID, articleID)
	}
	if bundle.Article.Author == nil || bundle.Article.Author.ID != userID {
		t.Fatalf("author = %+v, attendu id %s", bundle.Article.Author, userID)
	}
	if bundle.Article.Category == nil || bundle.Article.Category.Slug != "ecologie" {
		t.Fatalf("category = %+v, attendu ecologie", bundle.Article.Category)
	}
	if !bundle.Bookmarked || !bundle.Followed {
		t.Fatalf("bookmarked/followed = %v/%v, attendu true/true", bundle.Bookmarked, bundle.Followed)
	}
	if !bundle.Entitlements.IsMember || !bundle.Entitlements.IsPaidSubscriber {
		t.Fatalf("entitlements = %+v, attendu member+paid", bundle.Entitlements)
	}
	// Header : publication renseignée.
	if bundle.Publication.ID == "" || len(bundle.Publication.Navigation) != 1 {
		t.Fatal("publication du bundle incomplète")
	}

	// Viewer non identifié → pas d'entitlements.
	anon, err := svc.Article(ctx, "tenant", "article-tenant", "", "")
	if err != nil {
		t.Fatalf("Article anon: %v", err)
	}
	if anon.Entitlements.IsMember || anon.Bookmarked {
		t.Fatal("viewer anonyme ne doit pas avoir d'entitlements/interactions")
	}

	// Slug inconnu → 404.
	if _, err := svc.Article(ctx, "tenant", "introuvable", "", ""); err == nil {
		t.Fatal("Article attendu errNotFound")
	}
}

func TestPublicationsAttributionFallback(t *testing.T) {
	pubID, userID, _ := seedPublication(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Article co-écrit par le propriétaire de la publication (hors publication).
	coauthorPub := "pub_attribution_test"
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, subdomain, "updatedAt")
		VALUES ($1, 'PERSONAL', 'Co-Author', 'co-author', 'coauthor', now())`,
		coauthorPub); err != nil {
		t.Fatalf("publication coauthor: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility, "readingTime", "publicationId", "authorId", "createdAt", "updatedAt")
		VALUES ('article_coauthored', 'Co-écrit', 'co-ecrit', '<p>Ensemble</p>', true, false, 'PUBLIC', 2, $1, $2, now(), now())`,
		coauthorPub, userID); err != nil {
		t.Fatalf("article coauthor: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, 'article_coauthored', $1, 'CO_AUTHOR', 1, true, 'ACCEPTED', now(), now())`,
		userID); err != nil {
		t.Fatalf("attribution: %v", err)
	}

	// La publication tenant ne contient pas cet article directement, mais son
	// propriétaire est co-auteur ACCEPTED → résolution via attribution.
	bundle, err := svc.Article(ctx, "tenant", "co-ecrit", "", "")
	if err != nil {
		t.Fatalf("Article via attribution: %v", err)
	}
	if !bundle.IsViaAttribution {
		t.Fatal("attendu isViaAttribution = true")
	}
	if bundle.Article.ID != "article_coauthored" {
		t.Fatalf("article = %s, attendu article_coauthored", bundle.Article.ID)
	}

	// Sans attribution acceptée → 404.
	_ = pubID
	if _, err := poolTest.Exec(ctx,
		`UPDATE "ArticleAttribution" SET "consentStatus" = 'PENDING' WHERE "articleId" = 'article_coauthored'`); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Article(ctx, "tenant", "co-ecrit", "", ""); err == nil {
		t.Fatal("attendu errNotFound sans attribution ACCEPTED")
	}
}
