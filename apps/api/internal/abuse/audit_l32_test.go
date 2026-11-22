package abuse

// Audit L32 — le verdict humain d'un recours doit porter la politique et la
// version de la décision contestée, sinon le dossier n'est plus rejouable.

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestAuditL32_AppealVerdictKeepsContestedPolicy(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	// Base dans le passé : les verdicts du test ne doivent jamais être datés
	// dans le futur, sinon ils restent « les plus récents » pour la file de
	// revue globale et faussent les comptages des tests suivants.
	base := time.Now().Add(-2 * time.Minute)
	user := fmt.Sprintf("appeal-l32-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		// Lignes du test uniquement (fixture) : la base de test est partagée.
		for _, q := range []string{
			`DELETE FROM "RiskDecision" WHERE "subjectId" = $1 AND "subjectType" = 'user'`,
			`DELETE FROM "AbuseSignal" WHERE "subjectId" = $1`,
			`DELETE FROM "AppealMessage" WHERE "appealId" IN (SELECT "id" FROM "Appeal" WHERE "openedBy" = $1)`,
			`DELETE FROM "Appeal" WHERE "openedBy" = $1`,
		} {
			if _, err := poolTest.Exec(ctx, q, user); err != nil {
				t.Logf("nettoyage fixture : %v", err)
			}
		}
	})

	// Essaim de signalements auto-évalué : verdict needs_review persisté par
	// la politique COURANTE (v3).
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportVolume, SubjectUser, user,
			"test", ConfidenceObserved, ReportSignalRetention, base.Add(-time.Duration(i)*time.Minute))
	}
	if out := EvaluateSubject(ctx, poolTest, SignalReportVolume, SubjectUser, user, base); out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", out.Decision)
	}
	var contestedPolicy, contestedVersion string
	if err := poolTest.QueryRow(ctx,
		`SELECT "policy", "version" FROM "RiskDecision"
		 WHERE "subjectType" = 'user' AND "subjectId" = $1
		 ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`, user,
	).Scan(&contestedPolicy, &contestedVersion); err != nil {
		t.Fatalf("verdict auto introuvable : %v", err)
	}
	if contestedVersion != CurrentPolicy.Version {
		t.Fatalf("fixture incohérente : verdict auto en %s, politique courante %s",
			contestedVersion, CurrentPolicy.Version)
	}

	appeal, err := OpenAppeal(ctx, poolTest, SubjectUser, user, user, "je conteste ce classement", base.Add(time.Second))
	if err != nil {
		t.Fatalf("ouverture : %v", err)
	}
	if _, err := DecideAppeal(ctx, poolTest, appeal.ID, "staff-l32", "decided", "upheld", "confirmé", "", base.Add(2*time.Second)); err != nil {
		t.Fatalf("décision : %v", err)
	}

	var policy, version string
	if err := poolTest.QueryRow(ctx,
		`SELECT "policy", "version" FROM "RiskDecision" WHERE "appealRef" = $1`, appeal.ID,
	).Scan(&policy, &version); err != nil {
		t.Fatalf("verdict humain introuvable : %v", err)
	}
	if policy != contestedPolicy || version != contestedVersion {
		t.Fatalf("verdict humain enregistré %s/%s alors que la décision contestée est %s/%s",
			policy, version, contestedPolicy, contestedVersion)
	}
}
