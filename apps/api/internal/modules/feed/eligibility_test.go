package feed

// Éligibilité de recommandation (fiche 06 §9) : refus dur vs limitation
// motivée. Exige Postgres (testcontainers) — skippé sans Docker.
//   - alice (limitation humaine) : absente de discover/recommended,
//     PRÉSENTE en following (la limitation freine l'amplification, pas le choix).
//   - bob (suspicion humaine = refus dur) : absent PARTOUT, suivi inclus.

import (
	"context"
	"testing"
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
