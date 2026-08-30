package feed

import (
	"context"
	"fmt"
	"testing"
)

// TestVelocityScores vérifie le signal « trending » : seuls les événements de
// la fenêtre 48h comptent (un like vieux de 60h est ignoré), et le score est
// borné à [0,1] (10 likes récents / cible 8 → vélocité max pour une pensée ;
// 5 sessions récentes / cible 20 → 0.25 pour un article).
func TestVelocityScores(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	// seedEngine ne tronque pas Like/ReadingSession — on nettoie pour isoler.
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Like", "ReadingSession" CASCADE`); err != nil {
		t.Fatalf("truncate signaux: %v", err)
	}
	readerID := "00000000-0000-0000-0000-000000000010"

	// Pensée « chaude » : 10 likes récents (10 utilisateurs différents — la
	// contrainte Like_postId_userId interdit 2 likes du même user) + 1 like
	// vieux (exclu de la fenêtre 48h).
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount", embedding)
		VALUES ('vel_post', 'Pensée chaude', $1, now(), now(), ARRAY[]::text[], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0, `+vec512+`)`,
		"00000000-0000-0000-0000-000000000011"); err != nil {
		t.Fatalf("post: %v", err)
	}
	if err := likeOncePerUser(ctx, "vel_post", 10, 0); err != nil {
		t.Fatalf("likes récents: %v", err)
	}
	if err := likeOncePerUser(ctx, "vel_post", 1, 5000); err != nil {
		t.Fatalf("like récent: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Like" (id, "postId", "userId", "createdAt")
		VALUES (gen_random_uuid()::text, 'vel_post', $1::uuid, now() - interval '60 hours')`, readerID); err != nil {
		t.Fatalf("like vieux: %v", err)
	}

	// Article « chaud » : 5 lectures complétées récentes + 1 vieille (exclue).
	for i := 0; i < 5; i++ {
		if _, err := poolTest.Exec(ctx, `INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
			VALUES (gen_random_uuid()::text, 'eng_art_a', $1::uuid, 'feed', 'READ_COMPLETE', now())`, readerID); err != nil {
			t.Fatalf("session récente: %v", err)
		}
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
		VALUES (gen_random_uuid()::text, 'eng_art_a', $1::uuid, 'feed', 'READ_COMPLETE', now() - interval '60 hours')`, readerID); err != nil {
		t.Fatalf("session vieille: %v", err)
	}

	svc := newTestService()
	artVel, thVel := svc.getVelocityScores(ctx, []string{"eng_art_a"}, []string{"vel_post"}, svc.loadEngineConfig(ctx))
	if v := thVel["vel_post"]; v != 1.0 {
		t.Fatalf("vélocité pensée = %v, attendu 1.0 (10 likes/48h ≥ cible 8)", v)
	}
	if v := artVel["eng_art_a"]; v != 0.25 {
		t.Fatalf("vélocité article = %v, attendu 0.25 (5 sessions/20)", v)
	}
	// Aucun signal récent → absent des maps (pas de score fantôme).
	if _, ok := artVel["eng_art_b"]; ok {
		t.Fatal("article sans session récente ne doit pas apparaître dans les scores")
	}
	if _, ok := thVel["vel_post_missing"]; ok {
		t.Fatal("pensée inconnue ne doit pas apparaître dans les scores")
	}
}

// TestInjectDiscovery_AdaptiveRatio vérifie que le taux d'exploration dépend
// de la maturité du profil : froid (0 signal) → ratio 0.22 → 2 slots sur une
// page de 10 ; mature (15 signaux ≥ 10) → ratio 0.12 → 1 slot. C'est le
// comportement « bandit » anti-cold-start des plateformes.
func TestInjectDiscovery_AdaptiveRatio(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Like", "ReadingSession" CASCADE`); err != nil {
		t.Fatalf("truncate signaux: %v", err)
	}
	readerID := "00000000-0000-0000-0000-000000000010"

	// Le lecteur est dans la bulle pub_engine (d'où sortir pour explorer).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId")
		 VALUES (gen_random_uuid()::text, $1::uuid, 'pub_engine')`, readerID); err != nil {
		t.Fatalf("follow bulle: %v", err)
	}
	// 3 publications hors bulle avec des articles de qualité ≥ 0.8 (le seuil
	// explorationMinQuality) : assez de candidats pour remplir 2 slots.
	for i := 0; i < 3; i++ {
		pub := fmt.Sprintf("pub_out_%d", i)
		art := fmt.Sprintf("art_out_%d", i)
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
			VALUES ($1, 'PERSONAL', $1, $1, now(), now())`, pub); err != nil {
			t.Fatalf("pub: %v", err)
		}
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime",
			status, "completionRate", "publicationId", "authorId", "createdAt", "updatedAt")
			VALUES ($1, 'Découverte', $1, '<p>x</p>', true, 'PUBLIC', 5, 'PUBLISHED', 0.9, $2, $3::uuid, now(), now())`,
			art, pub, "00000000-0000-0000-0000-000000000011"); err != nil {
			t.Fatalf("article découverte: %v", err)
		}
	}

	svc := newTestService()
	in := make([]EngineItem, 0, 10)
	for i := 0; i < 10; i++ {
		in = append(in, EngineItem{ItemType: "ARTICLE", ID: fmt.Sprintf("base_%d", i)})
	}

	// Profil froid : 0 signal → ratio 0.22 → 2 slots sur 10.
	cold := svc.injectDiscovery(ctx, readerID, in, 10, svc.loadEngineConfig(ctx))
	if n := countDiscovery(cold); n != 2 {
		t.Fatalf("profil froid: %d injections, attendu 2 (ratio 0.22)", n)
	}

	// Profil mature : 15 sessions de lecture → 15 signaux ≥ 10 → ratio 0.12 →
	// 1 slot. (Les lectures complétées sur un article existant, pas de FK à
	// gérer — et pas de contrainte d'unicité sur ReadingSession.)
	for i := 0; i < 15; i++ {
		if _, err := poolTest.Exec(ctx, `INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "createdAt")
			VALUES (gen_random_uuid()::text, 'eng_art_a', $1::uuid, 'feed', 'READ_COMPLETE', now())`, readerID); err != nil {
			t.Fatalf("session mature: %v", err)
		}
	}
	warm := svc.injectDiscovery(ctx, readerID, in, 10, svc.loadEngineConfig(ctx))
	if n := countDiscovery(warm); n != 1 {
		t.Fatalf("profil mature: %d injections, attendu 1 (ratio 0.12)", n)
	}
}

// TestEngine_TrendingOutranks vérifie l'effet « trending » de bout en bout :
// deux pensées strictement identiques (même auteur, même embedding, même âge,
// même compteur cumulatif à 0) — seule la vélocité 48h les départage → la
// pensée « chaude » (10 likes récents) doit être la pensée retenue du feed.
func TestEngine_TrendingOutranks(t *testing.T) {
	ctx := context.Background()
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Like", "ReadingSession" CASCADE`); err != nil {
		t.Fatalf("truncate signaux: %v", err)
	}
	readerID := "00000000-0000-0000-0000-000000000010"

	insertThought := func(id string) {
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount", embedding)
			VALUES ($1, 'Pensée moteur identique', $2, now(), now(), ARRAY[]::text[], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0, `+vec512+`)`,
			id, "00000000-0000-0000-0000-000000000011"); err != nil {
			t.Fatalf("pensée %s: %v", id, err)
		}
	}
	insertThought("trend_post")
	insertThought("flat_post")
	// 10 likes récents sur la « chaude » seulement (10 users différents) —
	// compteurs cumulatifs identiques (0) pour que seule la vélocité départage.
	if err := likeOncePerUser(ctx, "trend_post", 10, 0); err != nil {
		t.Fatalf("likes: %v", err)
	}

	svc := newTestService()
	res, err := svc.PersonalizedEngine(ctx, readerID, 3, 0, 12)
	if err != nil {
		t.Fatalf("engine: %v", err)
	}
	// Page de 3 (après-midi) : 2 articles + 1 pensée. La pensée retenue doit
	// être la « chaude » (score +0.08 de vélocité, seul différentiel).
	var thoughtID string
	for _, it := range res.Items {
		if it.ItemType == "THOUGHT" {
			thoughtID = it.ID
		}
	}
	if thoughtID != "trend_post" {
		t.Fatalf("pensée retenue = %q, attendu trend_post (la vélocité 48h doit départager). items=%v",
			thoughtID, ids(res.Items))
	}
}

// countDiscovery compte les items injectés en exploration (IsDiscovery=true).
func countDiscovery(items []EngineItem) int {
	n := 0
	for _, it := range items {
		if it.IsDiscovery {
			n++
		}
	}
	return n
}

// likeOncePerUser crée n likes récents sur postID par n utilisateurs
// distincts (contrainte Like_postId_userId : un user ne peut liker qu'une
// fois un post). offset évite les collisions d'UUID entre appels de tests.
func likeOncePerUser(ctx context.Context, postID string, n, offset int) error {
	for i := 0; i < n; i++ {
		uid := fmt.Sprintf("00000000-0000-0000-0000-%012d", i+offset+1000)
		un := fmt.Sprintf("lk%d_%d@t.dev", i+offset, len(postID))
		if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			VALUES ($1, $2, $2, $2, 'user', now(), now())`, uid, un); err != nil {
			return err
		}
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Like" (id, "postId", "userId", "createdAt")
			VALUES (gen_random_uuid()::text, $1, $2::uuid, now())`, postID, uid); err != nil {
			return err
		}
	}
	return nil
}
