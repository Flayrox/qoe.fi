package seed

// Validation du seed Go : sur un schéma vierge (appliqué par testutil), Run
// doit créer toutes les données de démo (ids fixes e2e inclus) et être
// idempotent (re-run sans doublons).

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

func count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	if err := poolTest.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", query, err)
	}
	return n
}

// TestRunWorld vérifie la couche « monde vivant » posée après RunTop.
func TestRunWorld(t *testing.T) {
	ctx := context.Background()
	if _, err := RunTop(ctx, poolTest, TopOptions{
		Users: 20, Articles: 4, Posts: 10, ReadingSessions: 5,
		CreatorsRatio: 0.4, PremiumRatio: 0.1,
	}); err != nil {
		t.Fatalf("RunTop: %v", err)
	}
	if err := RunWorld(ctx, poolTest); err != nil {
		t.Fatalf("RunWorld: %v", err)
	}

	// Cast loggable présent (8 créateurs + 4 lecteurs + admin).
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE id::text IN ($1,$2,$3,$4)`,
		topUUID(900, "wc"), topUUID(901, "wc"), topUUID(910, "wc"), topUUID(911, "wc")); n != 4 {
		t.Fatalf("cast characters = %d, attendu 4", n)
	}

	// Réseau : au moins un follow vers la pub d'un créateur du cast.
	if n := count(t, `SELECT COUNT(*) FROM "Follows" f JOIN "Publication" p ON p.id = f."publicationId" WHERE p.subdomain IN ('ambrefeuillet','noehertig','raphmeriot')`); n < 3 {
		t.Fatalf("follows du cast = %d, attendu >= 3", n)
	}

	// Conversations : racine + réponses + private joke MEMBERS_ONLY.
	if n := count(t, `SELECT COUNT(*) FROM "Post" WHERE id = 'world_post_root_0'`); n != 1 {
		t.Fatalf("racine thread = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Post" WHERE "parentId" IS NOT NULL AND id LIKE 'world_post_r0_%'`); n != 6 {
		t.Fatalf("réponses du fil 0 = %d, attendu 6", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Post" WHERE id='world_post_root_3' AND "contentVisibility"='MEMBERS_ONLY'`); n != 1 {
		t.Fatalf("private joke MEMBERS_ONLY = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Post" WHERE "repostId" = 'world_post_root_0'`); n != 1 {
		t.Fatalf("repost = %d, attendu 1", n)
	}

	// Articles interconnectés + premium + co-auteur.
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE id = $1`, topID("wart", 1)); n != 1 {
		t.Fatalf("article réponse = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE id = $1 AND "isPremium"`, topID("wart", 2)); n != 1 {
		t.Fatalf("article premium ville = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "ArticleAttribution" WHERE "articleId" = $1`, topID("wart", 1)); n != 1 {
		t.Fatalf("co-auteur = %d, attendu 1", n)
	}

	// Poll + vote + tendance.
	if n := count(t, `SELECT COUNT(*) FROM "Poll" WHERE id = $1`, topID("wpol", 1)); n != 1 {
		t.Fatalf("poll = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "PollVote" WHERE "pollId" = $1`, topID("wpol", 1)); n < 4 {
		t.Fatalf("votes poll = %d, attendu >= 4", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Trend" WHERE hashtag = '#souverainete'`); n != 1 {
		t.Fatalf("trend #souverainete = %d, attendu 1", n)
	}

	// Notifications vivantes (LIKE + REPLY + FOLLOW) pour le cast.
	if n := count(t, `SELECT COUNT(*) FROM "Notification" WHERE id LIKE 'world_notif_%'`); n < 6 {
		t.Fatalf("notifications world = %d, attendu >= 6", n)
	}

	// Les identités et contenus du monde portent bien des visuels distincts
	// (avatars et couvertures ne doivent pas être un placeholder unique).
	if n := count(t, `SELECT COUNT(DISTINCT "logoUrl") FROM "User" WHERE id::text IN ($1,$2,$3,$4)`,
		topUUID(900, "wc"), topUUID(901, "wc"), topUUID(910, "wc"), topUUID(911, "wc")); n < 2 {
		t.Fatalf("diversité avatars = %d, attendu >= 2", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "imageUrl" IS NOT NULL`); n < 6 {
		t.Fatalf("articles illustrés = %d, attendu >= 6", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE array_to_string("semanticTags", ',') LIKE '%manga%'`); n < 1 {
		t.Fatalf("articles manga = %d, attendu >= 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE array_to_string("semanticTags", ',') LIKE '%romance%'`); n < 1 {
		t.Fatalf("articles romance = %d, attendu >= 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "ArticleComment" WHERE id LIKE 'world_comment_%'`); n < 3 {
		t.Fatalf("commentaires articles = %d, attendu >= 3", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE length(regexp_replace(content, '<[^>]+>', '', 'g')) >= 3000`); n < 1 {
		t.Fatalf("articles longs = %d, attendu >= 1", n)
	}

	// Idempotence du monde : un 2e run n'ajoute pas de doublons.
	for _, q := range []string{
		`SELECT COUNT(*) FROM "Post" WHERE id LIKE 'world_post_%'`,
		`SELECT COUNT(*) FROM "Follows" WHERE id LIKE 'wflw_%'`,
		`SELECT COUNT(*) FROM "Like" WHERE id LIKE 'wlik_w%'`,
	} {
		before := count(t, q)
		if err := RunWorld(ctx, poolTest); err != nil {
			t.Fatalf("RunWorld (2e): %v", err)
		}
		after := count(t, q)
		if before != after {
			t.Fatalf("doublons monde: %d → %d", before, after)
		}
	}
}

// TestRunTopKeepAdmin vérifie que la régénération « top du top » recrée bien
// l'admin superadmin canonique (aligné sur Supabase Auth) après le wipe : sans
// cela, GET /v1/me → 404 pour admin@qoe.fi et le RBAC superadmin → 403.
func TestAddTopPreservesExistingContent(t *testing.T) {
	ctx := context.Background()
	if _, err := RunTop(ctx, poolTest, TopOptions{Users: 20, Articles: 4, Posts: 10, ReadingSessions: 5, CreatorsRatio: 0.4, PremiumRatio: 0.1}); err != nil {
		t.Fatalf("RunTop: %v", err)
	}
	beforeArticles := count(t, `SELECT COUNT(*) FROM "Article"`)
	beforePosts := count(t, `SELECT COUNT(*) FROM "Post"`)
	if _, err := AddTop(ctx, poolTest, TopOptions{Users: 20, Articles: 4, Posts: 10}); err != nil {
		t.Fatalf("AddTop: %v", err)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article"`); n < beforeArticles+4 {
		t.Fatalf("articles additifs = %d, avant %d", n, beforeArticles)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Post"`); n < beforePosts+10 {
		t.Fatalf("posts additifs = %d, avant %d", n, beforePosts)
	}
	addedArticles := count(t, `SELECT COUNT(*) FROM "Article" WHERE id LIKE 'addart_%'`)
	addedPosts := count(t, `SELECT COUNT(*) FROM "Post" WHERE id LIKE 'addpost_%'`)
	if _, err := AddTop(ctx, poolTest, TopOptions{Users: 20, Articles: 4, Posts: 10}); err != nil {
		t.Fatalf("AddTop (2e): %v", err)
	}
	if count(t, `SELECT COUNT(*) FROM "Article" WHERE id LIKE 'addart_%'`) != addedArticles || count(t, `SELECT COUNT(*) FROM "Post" WHERE id LIKE 'addpost_%'`) != addedPosts {
		t.Fatalf("AddTop a créé des doublons")
	}
}

func TestRunTopKeepAdmin(t *testing.T) {
	ctx := context.Background()
	// Petit profil pour que le test reste rapide.
	if _, err := RunTop(ctx, poolTest, TopOptions{
		Users: 20, Articles: 4, Posts: 10, ReadingSessions: 5,
		CreatorsRatio: 0.4, PremiumRatio: 0.1,
	}); err != nil {
		t.Fatalf("RunTop: %v", err)
	}

	// L'admin superadmin aligné Supabase Auth doit exister (id fixe).
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE id = $1 AND role = 'superadmin' AND email = 'admin@qoe.fi'`, AdminUserID); n != 1 {
		t.Fatalf("admin superadmin après RunTop = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND "isCertified"`, AdminPubID); n != 1 {
		t.Fatalf("publication admin certifiée après RunTop = %d, attendu 1", n)
	}
}

// TestRunTopPersonas vérifie que la génération produit des comptes variés et
// crédibles : photos de profil réelles (catalogue) quasi toutes distinctes,
// mix pseudonymes / « Prénom Nom », genre et tranche d'âge renseignés.
func TestRunTopPersonas(t *testing.T) {
	ctx := context.Background()
	if _, err := RunTop(ctx, poolTest, TopOptions{
		Users: 120, Articles: 4, Posts: 60, ReadingSessions: 5,
		CreatorsRatio: 0.4, PremiumRatio: 0.1,
	}); err != nil {
		t.Fatalf("RunTop: %v", err)
	}

	// Avatars : le catalogue (~270 photos) doit éviter les répétitions sur 120
	// comptes → quasi tous distincts (l'admin n'a pas de logoUrl).
	distinct := count(t, `SELECT COUNT(DISTINCT "logoUrl") FROM "User" WHERE "logoUrl" IS NOT NULL AND id <> $1`, AdminUserID)
	if distinct < 90 {
		t.Fatalf("avatars distincts = %d, attendu >= 90 (catalogue 270)", distinct)
	}

	// Mix d'identités : pseudonymes (noms sans espace) et noms réels (avec espace).
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE name NOT LIKE '% %'`); n < 20 {
		t.Fatalf("comptes pseudonymes = %d, attendu >= 20", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE name LIKE '% %'`); n < 20 {
		t.Fatalf("comptes nom+prénom = %d, attendu >= 20", n)
	}

	// Genre et tranche d'âge renseignés (colonnes désormais alimentées).
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE gender IS NOT NULL AND "ageRange" IS NOT NULL`); n < 100 {
		t.Fatalf("users avec genre+âge = %d, attendu >= 100", n)
	}

	// Cohérence posts ↔ milieu : un créateur publie presque toujours dans son
	// milieu (thoughtFor persona à 90%) → pour chaque auteur ayant ≥2 racines
	// taguées, son tag dominant doit couvrir la majorité de ses racines. Une
	// réponse hérite des tags de son parent (alignement du fil).
	var incoherentAuthors int
	if err := poolTest.QueryRow(ctx, `WITH author_tags AS (
			SELECT p."authorId", p.tags[1] AS t, count(*) AS n
			FROM "Post" p
			WHERE p."parentId" IS NULL AND cardinality(p.tags) > 0
			GROUP BY 1, 2
		), dominants AS (
			SELECT "authorId", t, n, row_number() OVER (PARTITION BY "authorId" ORDER BY n DESC) AS rn
			FROM author_tags
		)
		SELECT count(*) FROM (
			SELECT d."authorId", d.n::float / sum(n) OVER (PARTITION BY d."authorId") AS ratio
			FROM dominants d WHERE d.rn = 1
		) x WHERE ratio < 0.6`).Scan(&incoherentAuthors); err != nil {
		t.Fatalf("count auteurs incohérents: %v", err)
	}
	if incoherentAuthors > 3 {
		t.Fatalf("auteurs au milieu dispersé = %d, attendu <= 3 (thoughtFor persona 90%%)", incoherentAuthors)
	}
	var alignedReplies int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Post" r
		JOIN "Post" p ON p.id = r."parentId"
		WHERE r.id LIKE 'post_%' AND r."parentId" IS NOT NULL
		  AND cardinality(p.tags) > 0 AND p.tags && r.tags`).Scan(&alignedReplies); err != nil {
		t.Fatalf("count réponses alignées: %v", err)
	}
	var totalReplies int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "Post" r WHERE r.id LIKE 'post_%' AND r."parentId" IS NOT NULL`).Scan(&totalReplies); err != nil {
		t.Fatalf("count réponses totales: %v", err)
	}
	if alignedReplies*100 < totalReplies*60 {
		t.Fatalf("réponses alignées sur le parent = %d/%d, attendu >= 60%%", alignedReplies, totalReplies)
	}
}

func TestSeedRun(t *testing.T) {
	ctx := context.Background()
	if err := Run(ctx, poolTest); err != nil {
		t.Fatalf("Run: %v", err)
	}

	// IDs fixes e2e présents.
	if n := count(t, `SELECT COUNT(*) FROM "User" WHERE id = $1`, AdminUserID); n != 1 {
		t.Fatalf("admin user = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND "isCertified"`, AdminPubID); n != 1 {
		t.Fatalf("publication admin certifiée = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Publication" WHERE id = $1 AND type = 'MEDIA'`, MediaPubID); n != 1 {
		t.Fatalf("publication média = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "MediaMember" WHERE "mediaId" = $1`, MediaID); n != 4 {
		t.Fatalf("membres média = %d, attendu 4", n)
	}

	// Contenu.
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "publicationId" = $1 AND published`, AdminPubID); n != 4 {
		t.Fatalf("articles admin publiés = %d, attendu 4 (3 démo + 1 premium)", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE "publicationId" = $1`, MediaPubID); n != 1 {
		t.Fatalf("articles média = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Article" WHERE slug = 'essai-premium-souverainete' AND "isPremium"`); n != 1 {
		t.Fatalf("article premium = %d, attendu 1", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "NavigationItem" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("navigation = %d, attendu 4", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "SocialLink" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("socialLinks = %d, attendu 4", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "Category" WHERE "publicationId" = $1`, AdminPubID); n != 2 {
		t.Fatalf("catégories = %d, attendu 2", n)
	}
	if n := count(t, `SELECT COUNT(*) FROM "SystemConfig"`); n != 18+len(DefaultEngineConfigs()) {
		t.Fatalf("systemConfigs = %d, attendu %d (18 landing + catalogue moteur)", n, 18+len(DefaultEngineConfigs()))
	}

	// Idempotence : un second run ne crée pas de doublons.
	before := count(t, `SELECT COUNT(*) FROM "Article"`)
	if err := Run(ctx, poolTest); err != nil {
		t.Fatalf("Run (2e): %v", err)
	}
	after := count(t, `SELECT COUNT(*) FROM "Article"`)
	if before != after {
		t.Fatalf("doublons articles: %d → %d", before, after)
	}
	if n := count(t, `SELECT COUNT(*) FROM "NavigationItem" WHERE "publicationId" = $1`, AdminPubID); n != 4 {
		t.Fatalf("navigation après re-run = %d, attendu 4", n)
	}
}
