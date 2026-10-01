package abuse

// File de revue (fiche 06 §8) : seuls les verdicts qui clôturent sont
// acceptés d'un humain ; un dossier classé ne se re-clôt pas ; un dossier
// inexistant est un refus explicite, pas un dossier fantôme.

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestValidHumanResult(t *testing.T) {
	closes := []Decision{DecisionAllow, DecisionLimitDistribution, DecisionPauseSending, DecisionSuspend}
	for _, d := range closes {
		if !ValidHumanResult(d) {
			t.Errorf("%s doit clôturer une revue", d)
		}
	}
	transient := []Decision{DecisionSlow, DecisionChallenge, DecisionNeedsReview, Decision("nuke"), Decision("")}
	for _, d := range transient {
		if ValidHumanResult(d) {
			t.Errorf("%q ne doit PAS clôturer une revue", d)
		}
	}
}

func TestListOpenDecisions_NilPool_Empty(t *testing.T) {
	items, total, err := ListOpenDecisions(context.Background(), nil, 50, 0, time.Now())
	if err != nil || total != 0 || len(items) != 0 {
		t.Fatalf("pool nil : attendu (vide, 0, nil), obtenu (%d, %d, %v)", len(items), total, err)
	}
}

func TestResolveDecision_NilPool_Error(t *testing.T) {
	if _, err := ResolveDecision(context.Background(), nil, SubjectReportTarget, "x", "staff", DecisionAllow, "", time.Now()); err == nil {
		t.Fatal("pool nil : erreur attendue")
	}
}

// Purge de rétention : les signaux expirés et les fenêtres de budget mortes
// partent, les verdicts (actes traçables) et les signaux valides restent.
func TestPurgeExpiredAbuseData(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()

	scope := fmt.Sprintf("purge-%d", now.UnixNano())
	RecordSignal(ctx, poolTest, "test.purge", "test", scope+"-expired", "test", 50, -time.Hour, now)
	RecordSignal(ctx, poolTest, "test.purge", "test", scope+"-fresh", "test", 50, time.Hour, now)
	if _, err := ConsumeBudget(ctx, poolTest, "test", scope+"-old", ActionConfirmRequest, now.Add(-8*24*time.Hour), 1, 5); err != nil {
		t.Fatalf("budget vieux : %v", err)
	}
	if _, err := ConsumeBudget(ctx, poolTest, "test", scope+"-cur", ActionConfirmRequest, DailyWindow(now), 1, 5); err != nil {
		t.Fatalf("budget courant : %v", err)
	}

	sig, bud, err := PurgeExpiredAbuseData(ctx, poolTest, now)
	if err != nil {
		t.Fatalf("purge : %v", err)
	}
	if sig != 1 || bud != 1 {
		t.Fatalf("purge : attendu (1 signal, 1 budget), obtenu (%d, %d)", sig, bud)
	}
	var n int
	if err := poolTest.QueryRow(ctx, `SELECT COUNT(*) FROM "AbuseSignal" WHERE "type" = 'test.purge' AND "subjectId" = $1`, scope+"-fresh").Scan(&n); err != nil || n != 1 {
		t.Fatalf("signal valide conservé : count=%d err=%v", n, err)
	}
	// Le budget courant a survécu avec sa consommation (1/5) : la purge ne
	// remet jamais un compteur à zéro en douce. Preuve par le plafond : les 4
	// unités restantes passent (5/5 exactement), la suivante est refusée —
	// un compteur remis à zéro accorderait les deux.
	ok, err := ConsumeBudget(ctx, poolTest, "test", scope+"-cur", ActionConfirmRequest, DailyWindow(now), 4, 5)
	if err != nil || !ok {
		t.Fatalf("budget courant à 1/5 + 4 attendu accord, obtenu (%v, %v)", ok, err)
	}
	if ok, err := ConsumeBudget(ctx, poolTest, "test", scope+"-cur", ActionConfirmRequest, DailyWindow(now), 1, 5); err != nil || ok {
		t.Fatalf("budget courant à 5/5 : refus attendu, obtenu (%v, %v)", ok, err)
	}
}

// drainOpenDossiers classe (allow) tous les dossiers ouverts laissés par les
// autres tests du paquet : la file de revue est globale par nature
// (ListOpenDecisions ne filtre pas par test) et ce test contrôle des
// comptages exacts. On la vide par l'API publique — même chemin qu'un staff,
// pas un DELETE de complaisance.
func drainOpenDossiers(ctx context.Context, t *testing.T, now time.Time) {
	t.Helper()
	items, total, err := ListOpenDecisions(ctx, poolTest, 200, 0, now)
	if err != nil {
		t.Fatalf("vidage de la file : %v", err)
	}
	for _, d := range items {
		if _, err := ResolveDecision(ctx, poolTest, d.SubjectType, d.SubjectID, "test-drain", DecisionAllow, "vidage de file (fixture de test)", now); err != nil {
			t.Fatalf("vidage %s:%s (%d dossiers) : %v", d.SubjectType, d.SubjectID, total, err)
		}
	}
}

func TestReview_OpenResolveClose(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	drainOpenDossiers(ctx, t, now)
	subject := fmt.Sprintf("article:review-%d", now.UnixNano())

	// Pas de dossier avant les faits : refus explicite.
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subject, "staff-1", DecisionAllow, "", now); !errors.Is(err, ErrNoOpenDecision) {
		t.Fatalf("sans dossier : attendu ErrNoOpenDecision, obtenu %v", err)
	}

	// Essaim → verdict auto → dossier ouvert visible avec son contexte.
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subject,
			"test", ConfidenceUserReport, ReportSignalRetention, now.Add(-time.Duration(i)*time.Minute))
	}
	if out := EvaluateSubject(ctx, poolTest, SignalReportFiled, SubjectReportTarget, subject, now); out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", out.Decision)
	}
	items, total, err := ListOpenDecisions(ctx, poolTest, 50, 0, now)
	if err != nil {
		t.Fatalf("liste dossiers : %v", err)
	}
	if total != 1 || len(items) != 1 {
		t.Fatalf("attendu 1 dossier ouvert, obtenu total=%d items=%d", total, len(items))
	}
	d := items[0]
	if d.SubjectID != subject || d.Result != "needs_review" || d.RecentFacts != 10 {
		t.Fatalf("dossier incohérent : %+v", d)
	}

	// Un verdict transitoire ne clôt rien.
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subject, "staff-1", DecisionNeedsReview, "", now); !errors.Is(err, ErrInvalidHumanResult) {
		t.Fatalf("needs_review humain : attendu ErrInvalidHumanResult, obtenu %v", err)
	}

	// Classement avec motif : le dossier se ferme...
	id, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subject, "staff-1", DecisionAllow, "raid monté de toutes pièces, cible légitime", now)
	if err != nil || id == "" {
		t.Fatalf("classement : %v (id=%q)", err, id)
	}
	items, total, err = ListOpenDecisions(ctx, poolTest, 50, 0, now)
	if err != nil || total != 0 || len(items) != 0 {
		t.Fatalf("après classement : file vide attendue, obtenu total=%d (%v)", total, err)
	}

	// ...et ne se re-clôt pas.
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, subject, "staff-1", DecisionAllow, "", now); !errors.Is(err, ErrNoOpenDecision) {
		t.Fatalf("re-clôture : attendu ErrNoOpenDecision, obtenu %v", err)
	}

	// Départage même milliseconde : verdict auto puis humain au même instant
	// → c'est l'humain qui est lu comme dernier (la revue prime).
	sameMs := fmt.Sprintf("article:tiebreak-%d", now.UnixNano())
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportFiled, SubjectReportTarget, sameMs,
			"test", ConfidenceUserReport, ReportSignalRetention, now)
	}
	EvaluateSubject(ctx, poolTest, SignalReportFiled, SubjectReportTarget, sameMs, now)
	if _, err := ResolveDecision(ctx, poolTest, SubjectReportTarget, sameMs, "staff-2", DecisionAllow, "tiebreak", now); err != nil {
		t.Fatalf("classement même ms : %v", err)
	}
	items, total, err = ListOpenDecisions(ctx, poolTest, 50, 0, now)
	if err != nil || total != 0 {
		t.Fatalf("tiebreak : l'humain prime, file vide attendue (total=%d, %v)", total, err)
	}

	// Traçabilité : le verdict humain reprend les raisons de l'automate +
	// son code, avec auteur et note en clair.
	var reasons []string
	var decider, note string
	if err := poolTest.QueryRow(ctx,
		`SELECT "reasonCodes", "deciderId", "note" FROM "RiskDecision" WHERE "id" = $1`,
		id).Scan(&reasons, &decider, &note); err != nil {
		t.Fatalf("lecture verdict humain : %v", err)
	}
	if decider != "staff-1" || note != "raid monté de toutes pièces, cible légitime" {
		t.Fatalf("auteur/note : obtenu (%q, %q)", decider, note)
	}
	foundAuto, foundHuman := false, false
	for _, r := range reasons {
		if r == "swarm.report.target" {
			foundAuto = true
		}
		if r == "human:allow" {
			foundHuman = true
		}
	}
	if !foundAuto || !foundHuman {
		t.Fatalf("raisons continues automate→humain attendues, obtenu %v", reasons)
	}
}
