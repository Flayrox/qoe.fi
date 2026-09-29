package abuse

// Métriques (fiche 06 §11) : le taux de classement après revue est LA mesure
// du faux positif. Exige Postgres — skippé sans Docker.

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestComputeMetrics_NilPool_Empty(t *testing.T) {
	m, err := ComputeMetrics(context.Background(), nil, 30, time.Now())
	if err != nil {
		t.Fatalf("pool nil : aucune erreur attendue, obtenu %v", err)
	}
	if m.HumanReviews != 0 || m.DismissalRate != -1 || len(m.TopSubjects) != 0 {
		t.Fatalf("pool nil : instantané vide attendu, obtenu %+v", m)
	}
}

func TestComputeMetrics_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	tag := fmt.Sprintf("metrics-%d", now.UnixNano())
	subA := "article:" + tag + "-a"
	subB := "article:" + tag + "-b"

	// Deux essaims → deux verdicts auto needs_review, deux dossiers.
	for _, sub := range []string{subA, subB} {
		for i := 0; i < 10; i++ {
			RecordSignal(ctx, poolTest, SignalReportFiled, SubjectReportTarget, sub,
				"test", ConfidenceUserReport, ReportSignalRetention, now.Add(-time.Duration(i)*time.Minute))
		}
		if out := EvaluateSubject(ctx, poolTest, SignalReportFiled, SubjectReportTarget, sub, now); out.Decision != DecisionNeedsReview {
			t.Fatalf("essaim %s : attendu needs_review", sub)
		}
	}
	// Revue : A classé (faux positif avéré), B escaladé (suspend tracé).
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subA, "staff-m", DecisionAllow, "cible légitime", now); err != nil {
		t.Fatalf("classement A : %v", err)
	}
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subB, "staff-m", DecisionSuspend, "danger documenté", now); err != nil {
		t.Fatalf("escalade B : %v", err)
	}

	// On isole nos sujets : la base partagée peut contenir d'autres lignes.
	// Les assertions portent donc sur NOS raisons/sujets, pas les totaux.
	m, err := ComputeMetrics(ctx, poolTest, 30, now)
	if err != nil {
		t.Fatalf("métriques : %v", err)
	}
	if m.AutoByReason["swarm.report.target"] != 2 {
		t.Fatalf("2 essaims attendus en raisons auto, obtenu %v", m.AutoByReason)
	}
	if m.HumanReviews < 2 || m.HumanDismissed < 1 {
		t.Fatalf("2 revues dont 1 classement attendus, obtenu %+v", m)
	}
	if m.HumanByResult["allow"] < 1 || m.HumanByResult["suspend"] < 1 {
		t.Fatalf("classement + escalade attendus, obtenu %v", m.HumanByResult)
	}
	if m.DismissalRate < 0 || m.DismissalRate > 1 {
		t.Fatalf("taux de classement dans [0,1] attendu, obtenu %v", m.DismissalRate)
	}
	// Nos deux sujets sont chauds (10 signaux chacun) : présents au top.
	seen := map[string]bool{}
	for _, s := range m.TopSubjects {
		seen[s.SubjectID] = true
	}
	if !seen[subA] || !seen[subB] {
		t.Fatalf("sujets chauds attendus au top, obtenu %+v", m.TopSubjects)
	}
	// Les deux dossiers sont clos (allow + suspend) : aucun ne grossit la file.
	// (La file globale peut contenir d'autres dossiers d'autres tests.)
	for _, s := range m.TopSubjects {
		if s.SubjectID == subA && s.LastResult != "allow" {
			t.Fatalf("dernier verdict A = allow attendu, obtenu %s", s.LastResult)
		}
	}
}
