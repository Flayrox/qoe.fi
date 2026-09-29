package abuse

// Recours (tranche 6, amorce) : on ne conteste que pour soi, l'ouverture ne
// lève rien, un seul dossier ouvert à la fois, seule overturned lève.
// Transitions et outcomes purs testés sans base.

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestValidAppealOutcome(t *testing.T) {
	if !ValidAppealOutcome("upheld") || !ValidAppealOutcome("overturned") {
		t.Fatal("upheld/overturned doivent trancher")
	}
	for _, o := range []string{"", "allow", "needs_review", "pending"} {
		if ValidAppealOutcome(o) {
			t.Errorf("%q ne doit pas trancher", o)
		}
	}
}

func TestValidAppealStatusTransition(t *testing.T) {
	ok := map[[2]string]bool{
		{"open", "under_review"}: true, {"open", "decided"}: true,
		{"open", "open"}:            false,
		{"under_review", "decided"}: true,
		{"under_review", "open"}:    false, {"under_review", "under_review"}: false,
		{"decided", "open"}: false, {"decided", "under_review"}: false, {"decided", "decided"}: false,
		{"bogus", "open"}: false,
	}
	for pair, want := range ok {
		if got := ValidAppealStatusTransition(pair[0], pair[1]); got != want {
			t.Errorf("transition %s → %s : attendu %v", pair[0], pair[1], want)
		}
	}
}

func TestAppeal_NilPool(t *testing.T) {
	ctx := context.Background()
	now := time.Now()
	if _, err := OpenAppeal(ctx, nil, SubjectUser, "u", "x", "msg", now); err == nil {
		t.Error("OpenAppeal nil : erreur attendue")
	}
	if _, err := GetAppeal(ctx, nil, "x"); err == nil {
		t.Error("GetAppeal nil : erreur attendue")
	}
	if items, total, err := ListUserAppeals(ctx, nil, "u", 20, 0); err != nil || total != 0 || len(items) != 0 {
		t.Error("ListUserAppeals nil : vide attendu")
	}
	if items, total, err := ListAllAppeals(ctx, nil, "", 50, 0); err != nil || total != 0 || len(items) != 0 {
		t.Error("ListAllAppeals nil : vide attendu")
	}
	if _, err := DecideAppeal(ctx, nil, "x", "s", "", "", "", "", now); err == nil {
		t.Error("DecideAppeal nil : erreur attendue")
	}
}

// insertHumanVerdictDirect pose une mesure humaine (fixture) : le recours
// conteste des verdicts, il ne les fabrique pas.
func insertHumanVerdictDirect(ctx context.Context, t *testing.T, subjectType, subjectID, result string) string {
	t.Helper()
	var id string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "RiskDecision" ("id", "policy", "version", "subjectType", "subjectId", "result", "reasonCodes", "decidedBy", "deciderId", "createdAt")
		 VALUES (gen_random_uuid()::text, 'abuse-core', 'v1', $1, $2, $3, '{test:fixture}', 'human', 'test-staff', now())
		 RETURNING "id"`,
		subjectType, subjectID, result).Scan(&id); err != nil {
		t.Fatalf("fixture verdict : %v", err)
	}
	return id
}

func TestAppeal_FullCycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	now := time.Now()
	user := fmt.Sprintf("appeal-user-%d", now.UnixNano())
	other := fmt.Sprintf("appeal-user-%d-other", now.UnixNano())

	// Sans verdict : rien à contester.
	if _, err := OpenAppeal(ctx, poolTest, SubjectUser, user, user, "je conteste", now); !errors.Is(err, ErrNothingToAppeal) {
		t.Fatalf("sans verdict : attendu ErrNothingToAppeal, obtenu %v", err)
	}
	// Pour autrui : interdit.
	insertHumanVerdictDirect(ctx, t, SubjectUser, other, "suspend")
	if _, err := OpenAppeal(ctx, poolTest, SubjectUser, other, user, "pour autrui", now); !errors.Is(err, ErrAppealForbidden) {
		t.Fatalf("pour autrui : attendu ErrAppealForbidden, obtenu %v", err)
	}
	// Sujet non-compte : hors périmètre de l'amorce.
	if _, err := OpenAppeal(ctx, poolTest, SubjectReportTarget, "article:x", user, "contenu", now); !errors.Is(err, ErrAppealForbidden) {
		t.Fatalf("contenu : attendu ErrAppealForbidden, obtenu %v", err)
	}

	// Mesure contre le compte : ouverture.
	verdictID := insertHumanVerdictDirect(ctx, t, SubjectUser, user, "suspend")
	a, err := OpenAppeal(ctx, poolTest, SubjectUser, user, user, "faux positif, voici pourquoi", now)
	if err != nil {
		t.Fatalf("ouverture : %v", err)
	}
	if a.Status != "open" || a.DecisionID == nil || *a.DecisionID != verdictID {
		t.Fatalf("dossier lié au verdict attendu, obtenu %+v", a)
	}
	if len(a.Messages) != 1 || a.Messages[0].Body != "faux positif, voici pourquoi" {
		t.Fatalf("message initial attendu, obtenu %+v", a.Messages)
	}
	// L'ouverture NE LÈVE RIEN : le dernier verdict est toujours suspend.
	var last string
	if err := poolTest.QueryRow(ctx,
		`SELECT "result" FROM "RiskDecision" WHERE "subjectType" = 'user' AND "subjectId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		user).Scan(&last); err != nil || last != "suspend" {
		t.Fatalf("ouverture : mesure intacte attendue (suspend), obtenu %q (%v)", last, err)
	}
	// Anti-saturation : un seul dossier ouvert.
	if _, err := OpenAppeal(ctx, poolTest, SubjectUser, user, user, "encore", now); !errors.Is(err, ErrAppealAlreadyOpen) {
		t.Fatalf("doublon : attendu ErrAppealAlreadyOpen, obtenu %v", err)
	}

	// Message de l'ouvreur.
	a, err = AddUserMessage(ctx, poolTest, a.ID, user, "précision : ...", now)
	if err != nil || len(a.Messages) != 2 {
		t.Fatalf("2e message : %v (%+v)", err, a)
	}
	// Message d'autrui : interdit.
	if _, err := AddUserMessage(ctx, poolTest, a.ID, other, "intrus", now); !errors.Is(err, ErrAppealForbidden) {
		t.Fatalf("intrus : attendu ErrAppealForbidden, obtenu %v", err)
	}

	// Prise en main puis confirmation : la mesure est maintenue par un
	// verdict humain qui porte appealRef.
	a, err = DecideAppeal(ctx, poolTest, a.ID, "staff-1", "under_review", "", "je regarde", "", now)
	if err != nil || a.Status != "under_review" {
		t.Fatalf("prise en main : %v (%+v)", err, a)
	}
	a, err = DecideAppeal(ctx, poolTest, a.ID, "staff-1", "decided", "upheld", "danger confirmé", "réponse à l'utilisateur", now)
	if err != nil {
		t.Fatalf("confirmation : %v", err)
	}
	if a.Status != "decided" || a.Outcome == nil || *a.Outcome != "upheld" {
		t.Fatalf("décidé/upheld attendu, obtenu %+v", a)
	}
	if len(a.Messages) != 3 {
		t.Fatalf("réponse staff en message attendue (3), obtenu %d", len(a.Messages))
	}
	var ref *string
	var res string
	if err := poolTest.QueryRow(ctx,
		`SELECT "result", "appealRef" FROM "RiskDecision"
		 WHERE "subjectType" = 'user' AND "subjectId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		user).Scan(&res, &ref); err != nil || res != "suspend" || ref == nil || *ref != a.ID {
		t.Fatalf("verdict humain suspend + appealRef attendu, obtenu (%q, %v, %v)", res, ref, err)
	}
	// Clos = clos (message comme décision).
	if _, err := AddUserMessage(ctx, poolTest, a.ID, user, "trop tard", now); !errors.Is(err, ErrAppealClosed) {
		t.Fatalf("message sur clos : attendu ErrAppealClosed, obtenu %v", err)
	}
	if _, err := DecideAppeal(ctx, poolTest, a.ID, "staff-1", "decided", "overturned", "", "", now); !errors.Is(err, ErrAppealClosed) {
		t.Fatalf("re-décision : attendu ErrAppealClosed, obtenu %v", err)
	}

	// Nouveau cycle : essaim → needs_review auto → recours → overturned
	// (faux positif avéré : la mesure tombe via un verdict allow).
	for i := 0; i < 10; i++ {
		RecordSignal(ctx, poolTest, SignalReportVolume, SubjectUser, user,
			"test", ConfidenceObserved, ReportSignalRetention, now.Add(-time.Duration(i)*time.Minute))
	}
	if out := EvaluateSubject(ctx, poolTest, SignalReportVolume, SubjectUser, user, now); out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", out.Decision)
	}
	b, err := OpenAppeal(ctx, poolTest, SubjectUser, user, user, "2e vague, toujours innocent", now)
	if err != nil {
		t.Fatalf("2e ouverture (nouveau dossier, historique conservé) : %v", err)
	}
	if b.ID == a.ID {
		t.Fatal("nouveau dossier attendu, pas le même")
	}
	b, err = DecideAppeal(ctx, poolTest, b.ID, "staff-2", "decided", "overturned", "erreur reconnue", "", now)
	if err != nil {
		t.Fatalf("infirmité : %v", err)
	}
	// appealRef sur le verdict qui lève + continuité des raisons (l'essaim
	// reste lisible dans le verdict qui le clôt). Lecture PAR LE LIEN (pas
	// par récence : verdict auto et humain peuvent partager la même ms).
	var liftReasons []string
	var liftRes string
	if err := poolTest.QueryRow(ctx,
		`SELECT "result", "reasonCodes" FROM "RiskDecision" WHERE "appealRef" = $1`, b.ID).Scan(&liftRes, &liftReasons); err != nil {
		t.Fatalf("verdict qui lève introuvable : %v", err)
	}
	if liftRes != "allow" {
		t.Fatalf("overturned : verdict allow attendu, obtenu %q", liftRes)
	}
	foundSwarm, foundHuman := false, false
	for _, r := range liftReasons {
		if r == "swarm.report.reporter" {
			foundSwarm = true
		}
		if r == "human:overturned" {
			foundHuman = true
		}
	}
	if !foundSwarm || !foundHuman {
		t.Fatalf("raisons continues attendues, obtenu %v", liftReasons)
	}
}
