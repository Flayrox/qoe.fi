package tracking

// Tests d'intégration de la chaîne de capture (100% Go) :
//   - lecture (reading-session) : EMA completionRate + insertion ReadingSession
//   - impressions feed (feed-impression)
//   - « Voir moins » (show-less) : ContentFeedback + éloignement vectoriel
//
// Parité prod : les tables FeedImpression / ContentFeedback sont présentes
// dans sql/schema/schema.sql (cf. ajout) pour que le conteneur de test
// corresponde au schéma réel utilisé par ces handlers.

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

// vec512 construit un vecteur pgvector de 512 dimensions (parité Article/User/Post).
const vec512 = `('[' || array_to_string(array_fill(0.1::float8, ARRAY[512]), ',') || ']')::vector`

// seedTracking crée un environnement minimal pour la capture :
// 1 utilisateur (avec embedding), 1 publication + 1 article publié
// (completionRate=0.5, embedding) et 1 pensée (embedding).
func seedTracking(ctx context.Context, pool *pgxpool.Pool) (userID, articleID, postID, pubID string, err error) {
	userID = "00000000-0000-0000-0000-000000000004"
	articleID = "track_article"
	postID = "track_post"
	pubID = "track_pub"

	if _, err = pool.Exec(ctx, `TRUNCATE TABLE
		"ReadingSession", "FeedImpression", "ContentFeedback", "Post", "Article",
		"User", "Publication", "_CoAuthors" CASCADE`); err != nil {
		return "", "", "", "", err
	}

	if _, err = pool.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		 VALUES ($1, 'reader@test.dev', 'reader', 'Lectrice', 'user', now(), now(), `+vec512+`)`,
		userID); err != nil {
		return "", "", "", "", err
	}

	if _, err = pool.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Publication Track', 'publication-track', now(), now())`,
		pubID); err != nil {
		return "", "", "", "", err
	}

	if _, err = pool.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
		                        "completionRate", status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
		 VALUES ($1, 'Article Track', 'article-track', '<p>Contenu</p>', true, 'PUBLIC', 5,
		         0.5, 'PUBLISHED', $2, $3, now(), now(), `+vec512+`)`,
		articleID, pubID, userID); err != nil {
		return "", "", "", "", err
	}

	if _, err = pool.Exec(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		                     visibility, "contentVisibility", "isDraft", "replyRestriction",
		                     "likeCount", "repostCount", "replyCount", embedding)
		 VALUES ($1, 'Pensée trackable', $2, now(), now(), ARRAY[]::text[],
		         'public', 'PUBLIC', false, 'everyone', 0, 0, 0, `+vec512+`)`,
		postID, userID); err != nil {
		return "", "", "", "", err
	}

	return userID, articleID, postID, pubID, nil
}

// countRows est un petit helper COUNT(*).
func countRows(ctx context.Context, pool *pgxpool.Pool, query string, args ...any) (int, error) {
	var n int
	err := pool.QueryRow(ctx, query, args...).Scan(&n)
	return n, err
}

// TestTrackReadingSession vérifie la capture du reading-time : mise à jour EMA
// du completionRate de l'article + insertion d'une ReadingSession (authed),
// et mise à jour même pour un lecteur anonyme (sans ligne de session).
func TestTrackReadingSession(t *testing.T) {
	ctx := context.Background()
	userID, articleID, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// 1. READ_COMPLETE authed → EMA 0.5*0.9 + 1.0*0.1 = 0.55
	updated, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "READ_COMPLETE", 100, 30, 8, strPtr("qoe.fi"), strPtr("alice"))
	if err != nil {
		t.Fatalf("TrackReadingSession: %v", err)
	}
	if updated != 0.55 {
		t.Fatalf("completionRate = %v, attendu 0.55", updated)
	}
	var cr float64
	if err := poolTest.QueryRow(ctx, `SELECT "completionRate" FROM "Article" WHERE id=$1`, articleID).Scan(&cr); err != nil {
		t.Fatalf("read completionRate: %v", err)
	}
	if cr != 0.55 {
		t.Fatalf("article.completionRate = %v, attendu 0.55", cr)
	}
	// La session est bien insérée.
	n, err := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ReadingSession" WHERE "userId"=$1::uuid AND "articleId"=$2`, userID, articleID)
	if err != nil || n != 1 {
		t.Fatalf("sessions = %d (err=%v), attendu 1", n, err)
	}
	var st, source string
	var rt int
	if err := poolTest.QueryRow(ctx, `SELECT status, source, "readingTimeMinutes" FROM "ReadingSession" WHERE "userId"=$1::uuid AND "articleId"=$2`, userID, articleID).Scan(&st, &source, &rt); err != nil {
		t.Fatalf("read session: %v", err)
	}
	if st != "READ_COMPLETE" || source != "feed" || rt != 8 {
		t.Fatalf("session = (%s, %s, %d), attendu (READ_COMPLETE, feed, 8)", st, source, rt)
	}

	// 2. Statut invalide → coercé READ_PARTIAL (scroll 50 → sessionRate 0.5)
	if _, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "WEIRD", 50, 5, 6, nil, nil); err != nil {
		t.Fatalf("TrackReadingSession(2): %v", err)
	}
	n, _ = countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ReadingSession" WHERE "userId"=$1::uuid AND "articleId"=$2 AND status='READ_PARTIAL'`, userID, articleID)
	if n != 1 {
		t.Fatalf("sessions READ_PARTIAL = %d, attendu 1", n)
	}

	// 3. Anonyme (userID vide) : completionRate MAJ mais AUCUNE session insérée
	before, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ReadingSession" WHERE "articleId"=$1`, articleID)
	if _, err := svc.TrackReadingSession(ctx, "", articleID, "feed", "READ_COMPLETE", 100, 20, 5, nil, nil); err != nil {
		t.Fatalf("TrackReadingSession(anon): %v", err)
	}
	after, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ReadingSession" WHERE "articleId"=$1`, articleID)
	if after != before {
		t.Fatalf("sessions avant=%d après=%d : l'anonyme ne doit pas insérer de session", before, after)
	}
	var anonCR float64
	if err := poolTest.QueryRow(ctx, `SELECT "completionRate" FROM "Article" WHERE id=$1`, articleID).Scan(&anonCR); err != nil {
		t.Fatalf("read anon completionRate: %v", err)
	}
	if anonCR <= 0.55 {
		t.Fatalf("completionRate anonyme = %v, attendu > 0.55", anonCR)
	}
}

// TestTrackFeedImpression vérifie la capture des impressions du feed :
// filtrage des items invalides, clamp de position, userId nul autorisé.
func TestTrackFeedImpression(t *testing.T) {
	ctx := context.Background()
	userID, _, _, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// Authed : 1 ARTICLE + 1 THOUGHT valides (position 700 → clamp 500),
	// 1 item id vide (filtré), 1 itemType invalide (filtré).
	inserted, err := svc.TrackFeedImpression(ctx, userID, []FeedImpressionItem{
		{ItemType: "ARTICLE", ItemID: "art_x", Position: 3, IsDiscovery: true},
		{ItemType: "THOUGHT", ItemID: "p_y", Position: 700, IsDiscovery: false},
		{ItemType: "ARTICLE", ItemID: "", Position: 1, IsDiscovery: false},
		{ItemType: "BOGUS", ItemID: "z", Position: 1, IsDiscovery: false},
	})
	if err != nil {
		t.Fatalf("TrackFeedImpression: %v", err)
	}
	if inserted != 2 {
		t.Fatalf("inserted = %d, attendu 2", inserted)
	}
	n, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "FeedImpression" WHERE "userId"=$1::uuid`, userID)
	if n != 2 {
		t.Fatalf("impressions = %d, attendu 2", n)
	}
	// Position clampée à 500.
	var pos int
	if err := poolTest.QueryRow(ctx, `SELECT position FROM "FeedImpression" WHERE "itemId"='p_y'`).Scan(&pos); err != nil {
		t.Fatalf("read position: %v", err)
	}
	if pos != 500 {
		t.Fatalf("position = %d, attendu 500 (clamp)", pos)
	}
	var isDisc bool
	if err := poolTest.QueryRow(ctx, `SELECT "isDiscovery" FROM "FeedImpression" WHERE "itemId"='art_x' AND "itemType"='ARTICLE'`).Scan(&isDisc); err != nil {
		t.Fatalf("read isDiscovery: %v", err)
	}
	if !isDisc {
		t.Fatal("isDiscovery = false, attendu true")
	}

	// Anonyme : userId NULL autorisé.
	if _, err := svc.TrackFeedImpression(ctx, "", []FeedImpressionItem{{ItemType: "THOUGHT", ItemID: "p_anon", Position: 0}}); err != nil {
		t.Fatalf("TrackFeedImpression(anon): %v", err)
	}
	n, _ = countRows(ctx, poolTest, `SELECT COUNT(*) FROM "FeedImpression" WHERE "itemId"='p_anon' AND "userId" IS NULL`)
	if n != 1 {
		t.Fatalf("impression anonyme = %d, attendu 1", n)
	}
}

// TestTrackShowLess vérifie le « Voir moins » : ContentFeedback (idempotent)
// + éloignement vectoriel quand les embeddings sont présents.
func TestTrackShowLess(t *testing.T) {
	ctx := context.Background()
	userID, articleID, postID, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// 1. Sur une pensée (thoughtId) : feedback + éloignement vectoriel.
	fbID, vectorAdjusted, err := svc.TrackShowLess(ctx, userID, "", postID)
	if err != nil {
		t.Fatalf("TrackShowLess(thought): %v", err)
	}
	if fbID == "" {
		t.Fatal("feedbackId vide pour un post valide")
	}
	if !vectorAdjusted {
		t.Fatal("vectorAdjusted = false, attendu true (embeddings présents)")
	}
	// Idempotence : le même (user, post, SHOW_LESS) n'est pas dupliqué.
	if _, _, err := svc.TrackShowLess(ctx, userID, "", postID); err != nil {
		t.Fatalf("TrackShowLess(thought) #2: %v", err)
	}
	n, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ContentFeedback" WHERE "userId"=$1::uuid AND "thoughtId"=$2 AND type='SHOW_LESS'`, userID, postID)
	if n != 1 {
		t.Fatalf("ContentFeedback thought = %d, attendu 1 (idempotence)", n)
	}

	// 2. Sur un article (articleId) : ligne avec articleId, thoughtId NULL.
	fbArt, _, err := svc.TrackShowLess(ctx, userID, articleID, "")
	if err != nil {
		t.Fatalf("TrackShowLess(article): %v", err)
	}
	if fbArt == "" {
		t.Fatal("feedbackId vide pour un article valide")
	}
	n, _ = countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ContentFeedback" WHERE "userId"=$1::uuid AND "articleId"=$2 AND "thoughtId" IS NULL AND type='SHOW_LESS'`, userID, articleID)
	if n != 1 {
		t.Fatalf("ContentFeedback article = %d, attendu 1", n)
	}

	// 3. Anonyme → no-op (aucune ligne).
	if _, _, err := svc.TrackShowLess(ctx, "", articleID, ""); err != nil {
		t.Fatalf("TrackShowLess(anon): %v", err)
	}
	n, _ = countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ContentFeedback" WHERE "articleId"=$1 AND "userId" IS NULL`, articleID)
	if n != 0 {
		t.Fatalf("ContentFeedback anonyme = %d, attendu 0", n)
	}
}

// TestConnectedCaptureFlow simule le parcours d'un lecteur CONNECTÉ complet et
// vérifie que les données arrivent réellement en base : ReadingSession (statuts
// SKIM puis READ_COMPLETE), FeedImpression et ContentFeedback (show-less).
func TestConnectedCaptureFlow(t *testing.T) {
	ctx := context.Background()
	userID, articleID, postID, _, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// 1. Impressions (batch) → FeedImpression en base.
	if _, err := svc.TrackFeedImpression(ctx, userID, []FeedImpressionItem{
		{ItemType: "ARTICLE", ItemID: articleID, Position: 0},
		{ItemType: "THOUGHT", ItemID: postID, Position: 1, IsDiscovery: true},
	}); err != nil {
		t.Fatalf("TrackFeedImpression: %v", err)
	}
	nImp, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "FeedImpression" WHERE "userId"=$1::uuid`, userID)
	if nImp != 2 {
		t.Fatalf("FeedImpression = %d, attendu 2", nImp)
	}
	var disc bool
	if err := poolTest.QueryRow(ctx, `SELECT "isDiscovery" FROM "FeedImpression" WHERE "itemId"=$1 AND "userId"=$2::uuid`, postID, userID).Scan(&disc); err != nil || !disc {
		t.Fatalf("isDiscovery de l'impression pensée = %v (err=%v), attendu true", disc, err)
	}

	// 2. Sessions de lecture : SKIM puis READ_COMPLETE → ReadingSession en base.
	if _, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "SKIM", 85, 9, 5, strPtr("qoe.fi"), nil); err != nil {
		t.Fatalf("TrackReadingSession(SKIM): %v", err)
	}
	if _, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "READ_COMPLETE", 100, 42, 8, strPtr("qoe.fi"), nil); err != nil {
		t.Fatalf("TrackReadingSession(READ_COMPLETE): %v", err)
	}
	for _, st := range []string{"SKIM", "READ_COMPLETE"} {
		n, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ReadingSession" WHERE "userId"=$1::uuid AND status=$2`, userID, st)
		if n != 1 {
			t.Fatalf("ReadingSession status=%s = %d, attendu 1", st, n)
		}
	}

	// 3. « Voir moins » (pensée) → ContentFeedback en base.
	if _, _, err := svc.TrackShowLess(ctx, userID, "", postID); err != nil {
		t.Fatalf("TrackShowLess: %v", err)
	}
	nCf, _ := countRows(ctx, poolTest, `SELECT COUNT(*) FROM "ContentFeedback" WHERE "userId"=$1::uuid AND "thoughtId"=$2 AND type='SHOW_LESS'`, userID, postID)
	if nCf != 1 {
		t.Fatalf("ContentFeedback = %d, attendu 1", nCf)
	}
}

// TestReadingHistory vérifie GET /v1/me/reading-history : dédup par article
// (garde la session la plus récente), tri décroissant et filtre « jours ».
func TestReadingHistory(t *testing.T) {
	ctx := context.Background()
	userID, articleID, _, pubID, err := seedTracking(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()

	// Deuxième article (même publication) + un troisième pour le filtre « jours ».
	article2 := "track_article2"
	article3 := "track_article3"
	for _, id := range []string{article2, article3} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
			                        "completionRate", status, "publicationId", "authorId", "createdAt", "updatedAt", embedding)
			 VALUES ($1, 'Article '||$1, $1, '<p>Contenu</p>', true, 'PUBLIC', 4,
			          0.5, 'PUBLISHED', $2, $3, now(), now(), `+vec512+`)`,
			id, pubID, userID); err != nil {
			t.Fatalf("insert article %s: %v", id, err)
		}
	}

	// Sessions : article (SKIM puis READ_COMPLETE), article2 (une session), article3 (il y a 20 jours).
	if _, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "SKIM", 40, 8, 5, strPtr("qoe.fi"), nil); err != nil {
		t.Fatalf("TrackReadingSession(SKIM): %v", err)
	}
	if _, err := svc.TrackReadingSession(ctx, userID, articleID, "feed", "READ_COMPLETE", 100, 42, 8, strPtr("qoe.fi"), nil); err != nil {
		t.Fatalf("TrackReadingSession(READ_COMPLETE): %v", err)
	}
	if _, err := svc.TrackReadingSession(ctx, userID, article2, "direct", "READ_PARTIAL", 60, 20, 5, nil, nil); err != nil {
		t.Fatalf("TrackReadingSession(article2): %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "ReadingSession" (id, "userId", "articleId", source, status, "scrollDepth", "dwellSeconds", "createdAt")
		 VALUES ('rs_old', $1::uuid, $2, 'direct', 'READ_PARTIAL', 10, 5, now() - interval '20 days')`,
		userID, article3); err != nil {
		t.Fatalf("insert vieille session: %v", err)
	}

	// 14 jours → seuls article + article2 (l'ancienne session est exclue).
	items, err := svc.ReadingHistory(ctx, userID, 14)
	if err != nil {
		t.Fatalf("ReadingHistory(14): %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("ReadingHistory(14) = %d items, attendu 2", len(items))
	}
	// Tri décroissant : article2 (session la plus récente) en premier.
	if items[0].Article.ID != article2 || items[0].Status != "READ_PARTIAL" {
		t.Fatalf("premier item = %s (%s), attendu article2 READ_PARTIAL", items[0].Article.ID, items[0].Status)
	}
	// Dédup : l'article garde sa session READ_COMPLETE la plus récente (pas le SKIM).
	second := items[1]
	if second.Article.ID != articleID || second.Status != "READ_COMPLETE" || second.ScrollDepth != 100 || second.DwellSeconds != 42 {
		t.Fatalf("second item = %s (%s), attendu article READ_COMPLETE 100/42", second.Article.ID, second.Status)
	}
	if second.Article.Publication == nil || second.Article.Publication.Name != "Publication Track" {
		t.Fatalf("publication manquante ou erronée: %+v", second.Article.Publication)
	}
	if !second.CreatedAt.Valid {
		t.Fatalf("createdAt non renseigné")
	}

	// 30 jours → l'article3 (session vieille de 20 jours) apparaît en plus.
	items30, err := svc.ReadingHistory(ctx, userID, 30)
	if err != nil {
		t.Fatalf("ReadingHistory(30): %v", err)
	}
	if len(items30) != 3 {
		t.Fatalf("ReadingHistory(30) = %d items, attendu 3", len(items30))
	}
}

func strPtr(s string) *string { return &s }
