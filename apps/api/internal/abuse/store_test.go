package abuse

// Persistance signaux/décisions (fiche 06 §9) : ces tests exigent Postgres
// (testcontainers) — skippés sans Docker, comme le reste du repo. Le noyau
// pur est couvert par decision_test.go, exécutable partout.

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestEvaluateSubject_NilPool_Neutral(t *testing.T) {
	out := EvaluateSubject(context.Background(), nil, SignalSignupAttempt, SubjectPublication, "pub", time.Now())
	if out.Decision != DecisionAllow {
		t.Fatalf("pool nil : attendu allow, obtenu %s", out.Decision)
	}
}

func TestRecordSignal_ClampsConfidence(t *testing.T) {
	requirePool(t)
	// Ne doit jamais échouer sur des bornes absurdes : la confiance est
	// bornée, pas rejetée (l'anti-abus n'invalide pas le chemin principal).
	ctx := context.Background()
	now := time.Now()
	RecordSignal(ctx, poolTest, "test.clamp", "test", "s1", "test", -5, time.Hour, now)
	RecordSignal(ctx, poolTest, "test.clamp", "test", "s1", "test", 500, time.Hour, now)
	var lo, hi int
	if err := poolTest.QueryRow(ctx,
		`SELECT MIN("confidence"), MAX("confidence") FROM "AbuseSignal" WHERE "type" = 'test.clamp' AND "subjectId" = 's1'`,
	).Scan(&lo, &hi); err != nil {
		t.Fatalf("lecture bornes : %v", err)
	}
	if lo != 0 || hi != 100 {
		t.Fatalf("confiance bornée 0-100 attendue, obtenu [%d, %d]", lo, hi)
	}
}

// Les colonnes sont des TIMESTAMP SANS fuseau : enregistrer avec un instant
// en heure locale (CEST, comme un poste de dev) puis évaluer en UTC doit
// compter le fait — sans normalisation UTC, pgx stocke les champs locaux
// relus comme UTC et le fait paraît 2 h dans le futur (fenêtre morte).
// Régression réelle attrapée par le smoke dev du 29/09/2026.
func TestRecordSignal_NonUTCTimezoneStillCounts(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	cest := time.FixedZone("CEST", 2*3600)
	nowLocal := time.Now().In(cest)
	subject := fmt.Sprintf("pub-tz-%d", nowLocal.UnixNano())

	RecordSignal(ctx, poolTest, "test.tz", SubjectPublication, subject,
		"test", ConfidenceObserved, time.Hour, nowLocal)
	facts, err := loadRecentFacts(ctx, poolTest, "test.tz", SubjectPublication, subject, time.Now().UTC().Add(-time.Hour))
	if err != nil {
		t.Fatalf("lecture faits : %v", err)
	}
	if len(facts) != 1 {
		t.Fatalf("fait enregistré en heure locale : attendu 1 relu, obtenu %d", len(facts))
	}
	if time.Since(facts[0].ObservedAt).Abs() > 5*time.Minute {
		t.Fatalf("instant décalé : %v", facts[0].ObservedAt)
	}
}

func TestEvaluateSubject_BurstPersistsNeedsReview(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	subject := fmt.Sprintf("article:swarm-%d", now.UnixNano())

	// 10 signalements contre LA MÊME cible en moins d'une heure : essaim →
	// needs_review persistée, avec politique, version et raison.
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subject,
			"test", ConfidenceUserReport, ReportSignalRetention, now.Add(-time.Duration(i)*time.Minute))
	}
	out := EvaluateSubject(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subject, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", out.Decision)
	}
	var result, policy, version string
	var reasons []string
	if err := poolTest.QueryRow(ctx,
		`SELECT "result", "policy", "version", "reasonCodes" FROM "RiskDecision"
		 WHERE "subjectType" = $1 AND "subjectId" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
		SubjectReportTarget, subject,
	).Scan(&result, &policy, &version, &reasons); err != nil {
		t.Fatalf("verdict non persisté : %v", err)
	}
	// Politique courante, jamais un littéral : la version monte (v1 → v2) et
	// c'est le verdict persisté qui doit dire ce que le noyau applique.
	if result != "needs_review" || policy != CurrentPolicy.Name || version != CurrentPolicy.Version {
		t.Fatalf("verdict persisté incohérent : %s %s/%s (attendu %s/%s)",
			result, policy, version, CurrentPolicy.Name, CurrentPolicy.Version)
	}
	if len(reasons) != 1 || reasons[0] != "swarm.report.target" {
		t.Fatalf("raison attendue [swarm.report.target], obtenu %v", reasons)
	}
}

func TestEvaluateSubject_AllowPersistsNothing(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	subject := fmt.Sprintf("pub-quiet-%d", now.UnixNano())

	// 3 inscriptions : bruit normal → allow, et AUCUN verdict persisté (les
	// faits restent, les verdicts triviaux ne polluent pas la table).
	for i := 0; i < 3; i++ {
		RecordSignal(ctx, poolTest, SignalSignupAttempt, SubjectPublication, subject,
			"test", ConfidenceObserved, SignupSignalRetention, now.Add(-time.Duration(i)*time.Minute))
	}
	out := EvaluateSubject(ctx, poolTest, SignalSignupAttempt, SubjectPublication, subject, now)
	if out.Decision != DecisionAllow {
		t.Fatalf("bruit : attendu allow, obtenu %s", out.Decision)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "RiskDecision" WHERE "subjectType" = $1 AND "subjectId" = $2`,
		SubjectPublication, subject,
	).Scan(&n); err != nil {
		t.Fatalf("comptage verdicts : %v", err)
	}
	if n != 0 {
		t.Fatalf("allow ne persiste aucun verdict, trouvé %d", n)
	}
}
