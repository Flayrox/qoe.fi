package feed

// Éligibilité de recommandation (fiche 06 §9) : refus dur vs limitation
// motivée. Exige Postgres (testcontainers) — skippé sans Docker.
//   - alice (limitation humaine) : absente de discover/recommended,
//     PRÉSENTE en following (la limitation freine l'amplification, pas le choix).
//   - bob (suspicion humaine = refus dur) : absent PARTOUT, suivi inclus.

import (
	"context"
	"testing"
	"time"
)

func insertHumanVerdict(ctx context.Context, t *testing.T, subjectType, subjectID, result string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "RiskDecision" ("id", "policy", "version", "subjectType", "subjectId", "result", "reasonCodes", "decidedBy", "deciderId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'abuse-core', 'v1', $1, $2, $3, '{human:test}', 'human', 'test-staff', now())`,
		subjectType, subjectID, result); err != nil {
		t.Fatalf("verdict humain %s %s: %v", subjectType, result, err)
	}
}

func eligArticleIDs(arts []HydrateArticle) map[string]bool {
	m := make(map[string]bool, len(arts))
	for _, a := range arts {
		m[a.ID] = true
	}
	return m
}

func TestEligibility_LimitedAuthorStaysInFollowing(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	// Base propre : les verdicts ne sont pas TRUNCATE par seedEngine.
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "RiskDecision", "AbuseSignal"`); err != nil {
		t.Fatalf("truncate verdicts: %v", err)
	}
	aliceID := "00000000-0000-0000-0000-000000000011"
	bobID := "00000000-0000-0000-0000-000000000012"

	// Discover exige une publication certifiée.
	if _, err := poolTest.Exec(ctx, `UPDATE "Publication" SET "isCertified" = true WHERE id = 'pub_engine'`); err != nil {
		t.Fatalf("certify: %v", err)
	}
	// Le lecteur suit la publication (following = ses articles).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Follows" (id, "readerId", "publicationId")
		 VALUES (gen_random_uuid()::text, $1::uuid, 'pub_engine')`, readerID); err != nil {
		t.Fatalf("follow: %v", err)
	}

	insertHumanVerdict(ctx, t, "user", aliceID, "limit_distribution")
	insertHumanVerdict(ctx, t, "user", bobID, "suspend")

	res, err := newTestService().HomeFeed(ctx, readerID)
	if err != nil {
		t.Fatalf("HomeFeed: %v", err)
	}

	following := eligArticleIDs(res.Following.Articles)
	discover := eligArticleIDs(res.Discover.Articles)
	recommended := eligArticleIDs(res.Recommended.Articles)

	// alice limitée : hors découverte, mais TOUJOURS en suivi.
	if discover["eng_art_a"] {
		t.Error("alice limitée : présente en discover (attendu absente)")
	}
	if recommended["eng_art_a"] {
		t.Error("alice limitée : présente en recommended (attendu absente)")
	}
	if !following["eng_art_a"] {
		t.Error("alice limitée : absente du following (attendu présente — la limitation ne touche pas le suivi)")
	}
	// bob en refus dur : absent partout, suivi inclus.
	if discover["eng_art_b"] || recommended["eng_art_b"] || following["eng_art_b"] {
		t.Errorf("bob suspendu : présent quelque part (discover=%v recommended=%v following=%v)",
			discover["eng_art_b"], recommended["eng_art_b"], following["eng_art_b"])
	}
}

// Transparence du suivi (fiche 06 §9) : un auteur suivi et puni disparaît
// du flux MAIS apparaît dans followingHidden avec motif et échéance —
// jamais de suivi vide et muet.
func TestFollowingHidden_NamesRestrictedAuthors(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "RiskDecision", "AbuseSignal"`); err != nil {
		t.Fatalf("truncate verdicts: %v", err)
	}
	aliceID := "00000000-0000-0000-0000-000000000011"
	bobID := "00000000-0000-0000-0000-000000000012"

	// alice : shadowban motivé et borné (+24 h), propriétaire d'une
	// publication PERSONAL suivie, avec un article dedans.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "isShadowbanned" = true, "shadowbanReason" = 'test', "shadowbanUntil" = now() + interval '24 hours', "publicationId" = 'pub_alice' WHERE id = $1::uuid`, aliceID); err != nil {
		t.Fatalf("shadowban alice: %v", err)
	}
	// bob : suspendu (refus dur), même montage.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "isSuspended" = true, "suspendReason" = 'test', "publicationId" = 'pub_bob' WHERE id = $1::uuid`, bobID); err != nil {
		t.Fatalf("suspend bob: %v", err)
	}
	for _, p := range []struct{ id, name, slug string }{
		{"pub_alice", "Alice Pub", "alice-pub"},
		{"pub_bob", "Bob Pub", "bob-pub"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt") VALUES ($1, 'PERSONAL', $2, $3, now(), now())`,
			p.id, p.name, p.slug); err != nil {
			t.Fatalf("pub %s: %v", p.id, err)
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Follows" (id, "readerId", "publicationId") VALUES (gen_random_uuid()::text, $1::uuid, $2)`,
			readerID, p.id); err != nil {
			t.Fatalf("follow %s: %v", p.id, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('follow_art_alice', 'Alice', 'alice', '<p>x</p>', true, 'PUBLIC', 5, 'PUBLISHED', 'pub_alice', $1::uuid, now(), now())`, aliceID); err != nil {
		t.Fatalf("article alice: %v", err)
	}

	res, err := newTestService().HomeFeed(ctx, readerID)
	if err != nil {
		t.Fatalf("HomeFeed: %v", err)
	}
	// L'article d'alice est masqué du suivi (comportement inchangé)...
	if eligArticleIDs(res.Following.Articles)["follow_art_alice"] {
		t.Error("article d'une autrice restreinte : présent en following (attendu masqué)")
	}
	// ...MAIS l'autrice est nommée avec motif et échéance.
	hidden := map[string]HiddenAuthor{}
	for _, h := range res.FollowingHidden {
		hidden[h.AuthorID] = h
	}
	a, ok := hidden[aliceID]
	if !ok {
		t.Fatalf("alice absente de followingHidden : %+v", res.FollowingHidden)
	}
	if a.Reason != "restricted" || a.Until == nil {
		t.Fatalf("alice : attendu (restricted, échéance), obtenu (%s, %v)", a.Reason, a.Until)
	}
	if until, err := time.Parse(time.RFC3339, *a.Until); err != nil || time.Until(until) < 23*time.Hour {
		t.Fatalf("échéance ~+24 h attendue, obtenu %v (%v)", a.Until, err)
	}
	b, ok := hidden[bobID]
	if !ok {
		t.Fatalf("bob absent de followingHidden : %+v", res.FollowingHidden)
	}
	if b.Reason != "suspended" || b.Until != nil {
		t.Fatalf("bob : attendu (suspended, sans échéance), obtenu (%s, %v)", b.Reason, b.Until)
	}
}
