package analytics

// Tests d'intégration des métriques produit (GET /v1/analytics/product-metrics) :
// abonnés (total + 7j), top articles (bookmarks/comments/highlights/annotations),
// catégories et qualité de lecture — parité getCreatorAnalyticsData Prisma.

import (
	"context"
	"log"
	"os"
	"testing"
	"time"

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
	return NewService(poolTest, "")
}

// seedProductMetrics crée : publication PERSONAL + user creator (owner),
// 2 catégories, 3 articles publiés (1 bookmarked, 1 commenté, 1 highlighté)
// et 2 subscribers (1 récent).
func seedProductMetrics(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"ArticleAttribution", "AnnotationComment", "AnnotationUpvote", "ArticleComment",
		"Bookmark", "Highlight", "Subscriber", "Article", "Category", "MediaMember",
		"Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	const pubID = "pub_analytics_001"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Journal Analytics', 'journal-analytics', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	const ownerID = "00000000-0000-0000-0000-0000000000cc"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'owner-analytics@test.dev', 'owneranalytics', 'Owner', 'creator', $2, now(), now())`,
		ownerID, pubID); err != nil {
		t.Fatalf("user: %v", err)
	}
	var catTech, catFood string
	for _, c := range []struct{ id, name, slug string }{
		{"cat_an_tech", "Technologie", "tech"},
		{"cat_an_food", "Gastronomie", "food"},
	} {
		var inserted string
		if err := poolTest.QueryRow(ctx,
			`INSERT INTO "Category" (id, name, slug, description, "publicationId")
			 VALUES ($1, $2, $3, 'desc', $4) RETURNING id`, c.id, c.name, c.slug, pubID).Scan(&inserted); err != nil {
			t.Fatalf("cat %s: %v", c.name, err)
		}
		if c.id == "cat_an_tech" {
			catTech = c.id
		} else {
			catFood = c.id
		}
	}
	// 3 articles : tech (2) + food (1).
	articles := []struct {
		id, title, slug, cat string
		completion           float64
		daysAgo              int
	}{
		{"art_an_01", "Article tech A", "tech-a", catTech, 0.9, 1},
		{"art_an_02", "Article tech B", "tech-b", catTech, 0.3, 3},
		{"art_an_03", "Article food", "food-a", catFood, 0.0, 5},
	}
	for _, a := range articles {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
			                        "readingTime", status, "publicationId", "authorId", "categoryId",
			                        "completionRate", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, '<p>Contenu</p>', true, false, 'PUBLIC', 5, 'PUBLISHED',
			         $4, $5, $6, $7, now() - $8::int * interval '1 day', now())`,
			a.id, a.title, a.slug, pubID, ownerID, a.cat, a.completion, a.daysAgo); err != nil {
			t.Fatalf("article %s: %v", a.slug, err)
		}
	}
	// Compteurs : 1 bookmark + 1 commentaire + 1 highlight (public) + 1 annotation.
	seedCounters(t, ctx)
	// 2 subscribers : 1 récent (7j), 1 ancien.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'sub1@test.dev', $1, true, true, now() - interval '2 days', now()),
		        (gen_random_uuid()::text, 'sub2@test.dev', $1, true, true, now() - interval '30 days', now())`, pubID); err != nil {
		t.Fatalf("subscribers: %v", err)
	}
}

func seedCounters(t *testing.T, ctx context.Context) {
	t.Helper()
	const readerID = "00000000-0000-0000-0000-0000000000dd"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'reader-an@test.dev', 'readeran', 'Reader', 'user', now(), now())`, readerID); err != nil {
		t.Fatalf("reader: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Bookmark" (id, "readerId", "articleId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, 'art_an_01', now())`, readerID); err != nil {
		t.Fatalf("bookmark: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ArticleComment" (id, content, "articleId", "authorId", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'Super !', 'art_an_01', $1, now(), now())`, readerID); err != nil {
		t.Fatalf("comment: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "isPublic", "articleId", "readerId", "createdAt")
		 VALUES ('hl_an_01', 'passage', true, 'art_an_01', $1, now())`, readerID); err != nil {
		t.Fatalf("highlight: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "AnnotationComment" (id, content, "highlightId", "authorId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'note', 'hl_an_01', $1, now())`, readerID); err != nil {
		t.Fatalf("annotation: %v", err)
	}
}

func TestProductMetrics(t *testing.T) {
	ctx := context.Background()
	seedProductMetrics(t, ctx)
	svc := newTestService()

	pm, err := svc.ProductMetrics(ctx, "00000000-0000-0000-0000-0000000000cc", "pub_analytics_001")
	if err != nil {
		t.Fatalf("ProductMetrics: %v", err)
	}
	if pm.SubscriberCount != 2 {
		t.Fatalf("subscriberCount = %d, attendu 2", pm.SubscriberCount)
	}
	if pm.SubscriberDelta7d != 1 {
		t.Fatalf("subscriberDelta7d = %d, attendu 1", pm.SubscriberDelta7d)
	}
	if len(pm.TopArticles) != 3 {
		t.Fatalf("topArticles = %d, attendu 3", len(pm.TopArticles))
	}
	// art_an_01 : 1 bookmark + 1 comment + 1 highlight + 1 annotation = 4 interactions → en tête.
	if pm.TopArticles[0].Slug != "tech-a" {
		t.Fatalf("top article = %s, attendu tech-a", pm.TopArticles[0].Slug)
	}
	if pm.TopArticles[0].Interactions != 4 {
		t.Fatalf("interactions = %d, attendu 4", pm.TopArticles[0].Interactions)
	}
	if pm.TopArticles[0].HighlightsPublic != 1 || pm.TopArticles[0].HighlightsPrivate != 0 {
		t.Fatalf("highlights pub/priv = %d/%d, attendu 1/0",
			pm.TopArticles[0].HighlightsPublic, pm.TopArticles[0].HighlightsPrivate)
	}
	// tech = 2 articles → top catégorie.
	if len(pm.TopCategories) == 0 || pm.TopCategories[0].Name != "Technologie" {
		t.Fatalf("topCategories = %+v, attendu Technologie en tête", pm.TopCategories)
	}
	if pm.TopCategories[0].Count != 2 {
		t.Fatalf("topCategories[0].Count = %d, attendu 2", pm.TopCategories[0].Count)
	}
	// Qualité : tech-a 0.9 (deep), tech-b 0.3 (skim), food 0.0 (ignoré) → 50/50.
	if pm.ReadingQuality.DeepReadsRate != 50 || pm.ReadingQuality.SkimsRate != 50 {
		t.Fatalf("readingQuality = %+v, attendu deep 50 / skim 50", pm.ReadingQuality)
	}
	if pm.TotalBookmarks != 1 || pm.TotalHighlights != 1 {
		t.Fatalf("totaux = bookmarks %d / highlights %d, attendu 1/1",
			pm.TotalBookmarks, pm.TotalHighlights)
	}
	_ = time.Now
}
