package abuse

// Pivot d'observation (lot 1) : UN appel = 1 INSERT multi-lignes + 1
// évaluation par (type, sujet). Impossible d'enregistrer sans évaluer.
// Exige Postgres — skippé sans Docker ; le smoke dev exécute réellement.

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestObserve_NilOrEmpty(t *testing.T) {
	if out := Observe(context.Background(), nil, time.Now(), Signal{Type: SignalSignupAttempt}); out != nil {
		t.Fatal("pool nil : aucun verdict attendu")
	}
	requirePool(t)
	if out := Observe(context.Background(), poolTest, time.Now()); out != nil {
		t.Fatal("zéro signal : aucun verdict attendu")
	}
}

func TestObserve_BatchInsertAndGroupedOutcomes(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	tag := fmt.Sprintf("observe-%d", now.UnixNano())
	hot := "article:" + tag + "-hot"
	quiet := "article:" + tag + "-quiet"

	// 10 faits sur hot (essaim) + 1 sur quiet (bruit), en UN appel.
	signals := []Signal{{
		Type: SignalReportFiled, SubjectType: SubjectReportTarget, SubjectID: quiet,
		Source: "test", Confidence: ConfidenceUserReport, Retention: ReportSignalRetention,
	}}
	for i := 0; i < 10; i++ {
		signals = append(signals, Signal{
			Type: SignalReportFiled, SubjectType: SubjectReportTarget, SubjectID: hot,
			Source: "test", Confidence: ConfidenceUserReport, Retention: ReportSignalRetention,
		})
	}
	// L'ordre d'appel définit l'ordre des verdicts (groupes dans l'ordre
	// d'apparition) : plaçons le bruit d'abord pour le vérifier.
	_ = signals
	ordered := []Signal{signals[0]}
	ordered = append(ordered, signals[1:]...)

	outs := Observe(ctx, poolTest, now, ordered...)
	if len(outs) != 2 {
		t.Fatalf("2 groupes → 2 verdicts attendus, obtenu %d", len(outs))
	}
	if outs[0].Decision != DecisionAllow {
		t.Fatalf("bruit : attendu allow, obtenu %s", outs[0].Decision)
	}
	if outs[1].Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", outs[1].Decision)
	}
	// Un seul INSERT pour 11 faits : comptons les lignes.
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "AbuseSignal" WHERE "subjectId" IN ($1, $2)`, hot, quiet).Scan(&n); err != nil || n != 11 {
		t.Fatalf("11 faits persistés attendus, obtenu %d (%v)", n, err)
	}
}

func TestObserve_ParityWithSequential(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	tag := fmt.Sprintf("parity-%d", now.UnixNano())
	subA := "article:" + tag + "-a"
	subB := "article:" + tag + "-b"

	// Voie séquentielle (ancienne) sur A : 10 faits un par un.
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subA,
			"test", ConfidenceUserReport, ReportSignalRetention, now.Add(-time.Duration(i)*time.Minute))
	}
	seq := EvaluateSubject(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subA, now)

	// Voie pivot (nouvelle) sur B : mêmes faits en un appel.
	var batch []Signal
	for i := 0; i < 10; i++ {
		batch = append(batch, Signal{
			Type: SignalReportFiled, SubjectType: SubjectReportTarget, SubjectID: subB,
			Source: "test", Confidence: ConfidenceUserReport, Retention: ReportSignalRetention,
		})
	}
	// Mêmes instants relatifs que la voie séquentielle : on rejoue avec les
	// mêmes décalages (les faits portent l'instant d'observation).
	outs := Observe(ctx, poolTest, now, batch...)
	if len(outs) != 1 {
		t.Fatalf("1 groupe → 1 verdict attendu, obtenu %d", len(outs))
	}
	if outs[0].Decision != seq.Decision {
		t.Fatalf("parité : séquentiel=%s pivot=%s", seq.Decision, outs[0].Decision)
	}
	if len(outs[0].Reasons) != len(seq.Reasons) || outs[0].Version != seq.Version {
		t.Fatalf("parité raisons/version : %+v vs %+v", outs[0], seq)
	}
}
