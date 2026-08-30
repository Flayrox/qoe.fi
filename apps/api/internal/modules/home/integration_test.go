package home

// Tests d'intégration des widgets lecteur (GET /v1/home/*) :
//   - onboarding : catégories statiques + créateurs suggérés (certifiés)
//   - suggested-creators : cold-start (anonyme) + mode vectoriel
//   - semantic-trends : croissance par catégorie (7j vs 7j précédents)

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
	return NewService(poolTest)
}

// seedHomeWidgets crée publication PERSONAL + user creator + 2 catégories +
// articles (dont un récent, un ancien) pour les widgets.
func seedHomeWidgets(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Article", "Category", "User", "Publication", "Recommendation", "Follows", "Subscriber"
		CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	const pubID = "pub_home_001"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "isCertified", "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Journal Home', 'journal-home', true, now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	const authorID = "00000000-0000-0000-0000-0000000000aa"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'author-home@test.dev', 'authorhome', 'Auteur Home', 'creator', $2, now(), now())`,
		authorID, pubID); err != nil {
		t.Fatalf("user: %v", err)
	}
	var catTech, catFood string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Category" (id, name, slug, description, "publicationId")
		 VALUES ('cat_home_tech', 'Technologie', 'tech', 'Actualité tech', $1) RETURNING id`, pubID).Scan(&catTech); err != nil {
		t.Fatalf("cat tech: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Category" (id, name, slug, description, "publicationId")
		 VALUES ('cat_home_food', 'Gastronomie', 'food', 'Recettes', $1) RETURNING id`, pubID).Scan(&catFood); err != nil {
		t.Fatalf("cat food: %v", err)
	}
	// 3 articles tech publiés (2 dans les 7 derniers jours, 1 entre 7 et 14 jours)
	// + 1 article food publié (ancien).
	now := time.Now()
	articles := []struct {
		id, title, slug string
		catID           string
		createdAt       time.Time
	}{
		{"art_home_01", "Article récent 1", "article-recent-1", catTech, now.Add(-2 * 24 * time.Hour)},
		{"art_home_02", "Article récent 2", "article-recent-2", catTech, now.Add(-4 * 24 * time.Hour)},
		{"art_home_03", "Article ancien", "article-ancien", catTech, now.Add(-10 * 24 * time.Hour)},
		{"art_home_04", "Recette ancienne", "recette-ancienne", catFood, now.Add(-20 * 24 * time.Hour)},
	}
	for _, a := range articles {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
			                        "readingTime", status, "publicationId", "authorId", "categoryId",
			                        "createdAt", "updatedAt", "embedding")
			 VALUES ($1, $2, $3, '<p>Contenu</p>', true, false, 'PUBLIC', 5, 'PUBLISHED',
			         $4, $5, $6, $7, now(),
			         ('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector)`,
			a.id, a.title, a.slug, pubID, authorID, a.catID, a.createdAt); err != nil {
			t.Fatalf("article %s: %v", a.slug, err)
		}
	}
}

func TestOnboardingData(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	data := svc.GetOnboardingData(ctx)
	if len(data.Categories) == 0 {
		t.Fatal("categories vides")
	}
	if len(data.Categories) != 6 {
		t.Fatalf("6 catégories attendues, got %d", len(data.Categories))
	}
	if data.Categories[0].ID != "tech" || data.Categories[0].Subtopics[0].ID != "llm" {
		t.Fatalf("catégorie tech mal portée: %+v", data.Categories[0])
	}
	if len(data.SuggestedCreators) == 0 {
		t.Fatal("suggestedCreators vides (créateur certifié seedé)")
	}
	// Parité Prisma : le select porte sur Publication → id = id de publication.
	if data.SuggestedCreators[0].ID != "pub_home_001" {
		t.Fatalf("créateur inattendu: %+v", data.SuggestedCreators[0])
	}
	if !data.SuggestedCreators[0].IsCertified {
		t.Fatal("créateur devrait être certifié")
	}
}

func TestSuggestedCreatorsColdStart(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	creators, err := svc.GetSuggestedCreators(ctx, "", 4)
	if err != nil {
		t.Fatalf("cold-start: %v", err)
	}
	if len(creators) == 0 {
		t.Fatal("aucun créateur suggéré (cold-start)")
	}
	if creators[0].Name == "" {
		t.Fatal("name vide")
	}
	if creators[0].AffinityScore == 0 && creators[0].RecentArticleTitle == nil {
		// Cold-start : sim_score = 0, title présent — vérifions la cohérence.
		if creators[0].Username == "" {
			t.Fatalf("créateur incohérent: %+v", creators[0])
		}
	}
}

// TestSuggestedCreators_ThoughtOnly vérifie qu'un créateur SANS article publié
// (pensées uniquement — plateforme pensées-dominante) apparaît bien dans les
// recommandations : le moteur ne doit plus l'invisibiliser via son INNER JOIN
// sur Article.
func TestSuggestedCreators_ThoughtOnly(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	const pubID = "pub_home_thought"
	const authorID = "00000000-0000-0000-0000-0000000000cc"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "isCertified", "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Pensees-only', 'pensees-only', true, now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1::uuid, 'thoughtonly@test.dev', 'thoughtonly', 'Pensees Only', 'creator', $2, now(), now())`,
		authorID, pubID); err != nil {
		t.Fatalf("user: %v", err)
	}
	// Pensées uniquement (pas d'article).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags, visibility,
		                     "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount")
		 VALUES ('post_thought_only', 'Une pensée profonde', $1::uuid, now(), now(), ARRAY['Philosophie']::text[],
		         'public', 'PUBLIC', false, 'everyone', 12, 0, 1)`, authorID); err != nil {
		t.Fatalf("post: %v", err)
	}

	// Cold-start : un auteur pensées-only (certifié) doit être recommandé.
	creators, err := svc.GetSuggestedCreators(ctx, "", 8)
	if err != nil {
		t.Fatalf("cold-start thought-only: %v", err)
	}
	found := false
	for _, c := range creators {
		if c.Username == "thoughtonly" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("créateur pensées-only absent des recommandations: %+v", creators)
	}

	// Vectoriel aussi : l'auteur n'a pas d'embedding d'article → on retombe sur le
	// fallback neutre (sim 0.5), il doit rester listé.
	const readerID = "00000000-0000-0000-0000-0000000000dd"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", "embedding")
		 VALUES ($1, 'reader2@test.dev', 'reader2', 'L2', 'user', now(), now(),
		         ('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector)`, readerID); err != nil {
		t.Fatalf("reader2: %v", err)
	}
	creatorsVec, err := svc.GetSuggestedCreators(ctx, readerID, 8)
	if err != nil {
		t.Fatalf("vector thought-only: %v", err)
	}
	found = false
	for _, c := range creatorsVec {
		if c.Username == "thoughtonly" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("créateur pensées-only absent des recommandations vectorielles: %+v", creatorsVec)
	}
}

func TestSuggestedCreatorsVector(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	// Embedding utilisateur (512 dims) + follow.
	const readerID = "00000000-0000-0000-0000-0000000000bb"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", "embedding")
		 VALUES ($1, 'reader-home@test.dev', 'readerhome', 'Lecteur', 'user', now(), now(),
		         ('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector)`,
		readerID); err != nil {
		t.Fatalf("reader: %v", err)
	}

	creators, err := svc.GetSuggestedCreators(ctx, readerID, 4)
	if err != nil {
		t.Fatalf("vector: %v", err)
	}
	if len(creators) == 0 {
		t.Fatal("aucun créateur suggéré (vector)")
	}
	// L'auteur seedé a un embedding NULL → COALESCE(article.embedding) utilisé.
	if creators[0].Username == "" {
		t.Fatalf("créateur incohérent: %+v", creators[0])
	}
}

// TestSemanticTrends vérifie que les « sujets émergents » sont classés par
// momentum d'ENGAGEMENT réel (événements horodatés) et non par comptage de
// publications : un sujet densément lu depuis peu monte devant un sujet publié
// mais peu consommé.
func TestSemanticTrends(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "ReadingSession", "Like", "Post", "ContentFeedback" CASCADE`); err != nil {
		t.Fatalf("truncate engagement: %v", err)
	}
	// Tags sémantiques des articles seedés (seedHomeWidgets n'en pose pas).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Article" SET "semanticTags" = ARRAY['Technologie'] WHERE id IN ('art_home_01','art_home_03');
		 UPDATE "Article" SET "semanticTags" = ARRAY['Gastronomie'] WHERE id = 'art_home_04';`); err != nil {
		t.Fatalf("set semanticTags: %v", err)
	}
	now := time.Now()
	sevenDays := now.Add(-2 * 24 * time.Hour)
	fourteenDays := now.Add(-10 * 24 * time.Hour)
	addRead := func(art string, at time.Time) {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "readingTimeMinutes", "createdAt")
			 VALUES (gen_random_uuid()::text, $1, NULL, 'feed', 'READ_COMPLETE', 5, $2)`, art, at); err != nil {
			t.Fatalf("read %s: %v", art, err)
		}
	}
	// tech : 4 lectures récentes + 1 dans la fenêtre précédente → momentum fort
	// (300 %) même si le nombre d'articles publiés n'a pas bougé.
	for i := 0; i < 4; i++ {
		addRead("art_home_01", sevenDays)
	}
	addRead("art_home_03", fourteenDays) // base prev7 de tech
	// food : 1 seule lecture récente → précède? NON, momentum faible sans base.
	addRead("art_home_04", sevenDays)

	svc := newTestService()
	trends, err := svc.GetSemanticTrends(ctx, 5)
	if err != nil {
		t.Fatalf("semantic-trends: %v", err)
	}
	if len(trends) == 0 {
		t.Fatal("aucun trend")
	}
	// tech domine grâce à son momentum (pas à son nombre de publications).
	if trends[0].TopicName != "Technologie" {
		t.Fatalf("tech attendue en tête (momentum), got %s", trends[0].TopicName)
	}
	if trends[0].Count != 4 {
		t.Fatalf("count tech = 4 attendu (4 lectures récentes), got %d", trends[0].Count)
	}
	if trends[0].GrowthRate == "" {
		t.Fatal("growthRate vide")
	}
}

func TestSubscribeToNewsletter(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	ok, err := svc.SubscribeToNewsletter(ctx, "Newsletter@Test.dev", "pub_home_001")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	if !ok {
		t.Fatal("subscribe = false")
	}

	// Idempotent : re-inscription → toujours 1 ligne active.
	if _, err := svc.SubscribeToNewsletter(ctx, "newsletter@test.dev", "pub_home_001"); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Subscriber" WHERE email = 'newsletter@test.dev' AND "publicationId" = 'pub_home_001'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, attendu 1 (upsert idempotent)", count)
	}

	// Publication inconnue → erreur.
	if _, err := svc.SubscribeToNewsletter(ctx, "x@test.dev", "pub_inconnue"); err == nil {
		t.Fatal("subscribe sur publication inconnue devrait échouer")
	}
}
