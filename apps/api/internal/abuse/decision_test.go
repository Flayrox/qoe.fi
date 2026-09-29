package abuse

// Noyau de décision (fiche 06 §9) : tests purs, sans base. Mêmes faits, même
// instant → même verdict. Ces tests sont la spécification exécutable des
// deux règles v1 : bruit normal = allow, rafale = revue priorisée, jamais
// de sanction automatique.

import (
	"testing"
	"time"
)

// burstFabrique fabrique n faits du type/portée donnés, répartis sur la
// minute qui précède `now` (tous dans la fenêtre sauf mention contraire).
func burstFacts(signalType, subjectType, subjectID string, n int, now time.Time) []Fact {
	facts := make([]Fact, 0, n)
	for i := 0; i < n; i++ {
		facts = append(facts, Fact{
			Type:        signalType,
			SubjectType: subjectType,
			SubjectID:   subjectID,
			ObservedAt:  now.Add(-time.Duration(i) * time.Second),
		})
	}
	return facts
}

func TestPolicyV1_EmptyIsAllow(t *testing.T) {
	now := time.Now()
	out := PolicyV1.Evaluate(SubjectPublication, "pub-x", nil, now)
	if out.Decision != DecisionAllow {
		t.Fatalf("aucun fait : attendu allow, obtenu %s", out.Decision)
	}
	if len(out.Reasons) != 0 {
		t.Fatalf("aucun fait : aucune raison attendue, obtenu %v", out.Reasons)
	}
}

func TestPolicyV1_NormalNoiseIsAllow(t *testing.T) {
	now := time.Now()
	// Une publication qui cartonne (99 inscriptions en 10 min) : c'est le
	// succès, pas une attaque. Le seuil (100) ne doit pas punir la croissance.
	facts := burstFacts(SignalSignupAttempt, SubjectPublication, "pub-ok", 99, now)
	// Quelques signalements épars contre des cibles différentes : la vie
	// normale de la modération communautaire.
	for i := 0; i < 9; i++ {
		facts = append(facts, Fact{
			Type:        SignalReportFiled,
			SubjectType: SubjectReportTarget,
			SubjectID:   string(rune('a' + i)),
			ObservedAt:  now.Add(-time.Duration(i) * time.Minute),
		})
	}
	out := PolicyV1.Evaluate(SubjectPublication, "pub-ok", facts, now)
	if out.Decision != DecisionAllow {
		t.Fatalf("bruit normal : attendu allow, obtenu %s (%v)", out.Decision, out.Reasons)
	}
}

func TestPolicyV1_SignupBurstNeedsReview(t *testing.T) {
	now := time.Now()
	// 100 inscriptions en 10 min sur UNE publication : gabarit ferme de
	// comptes → revue priorisée, pas sanction.
	facts := burstFacts(SignalSignupAttempt, SubjectPublication, "pub-hit", 100, now)
	out := PolicyV1.Evaluate(SubjectPublication, "pub-hit", facts, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("rafale : attendu needs_review, obtenu %s", out.Decision)
	}
	if len(out.Reasons) != 1 || out.Reasons[0] != "burst.signup.publication" {
		t.Fatalf("raison attendue [burst.signup.publication], obtenu %v", out.Reasons)
	}
	if out.Policy != "abuse-core" || out.Version != "v1" {
		t.Fatalf("traçabilité : attendu abuse-core/v1, obtenu %s/%s", out.Policy, out.Version)
	}
}

func TestPolicyV1_StaleFactsIgnored(t *testing.T) {
	now := time.Now()
	// 200 inscriptions mais d'il y a 2 heures : hors fenêtre 10 min → allow.
	// Une rafale ancienne n'est plus une urgence.
	var facts []Fact
	for i := 0; i < 200; i++ {
		facts = append(facts, Fact{
			Type:        SignalSignupAttempt,
			SubjectType: SubjectPublication,
			SubjectID:   "pub-cold",
			ObservedAt:  now.Add(-2 * time.Hour),
		})
	}
	if out := PolicyV1.Evaluate(SubjectPublication, "pub-cold", facts, now); out.Decision != DecisionAllow {
		t.Fatalf("faits périmés : attendu allow, obtenu %s", out.Decision)
	}
}

func TestPolicyV1_ReportSwarmNeedsReview(t *testing.T) {
	now := time.Now()
	// 10 signalements en 1 h contre LA MÊME cible : gabarit raid coordonné
	// (scénario fiche 06 §11) → revue priorisée. La fiche §8 l'exige : ce
	// n'est PAS une preuve, donc pas de sanction — needs_review uniquement.
	var facts []Fact
	for i := 0; i < 10; i++ {
		facts = append(facts, Fact{
			Type:        SignalReportFiled,
			SubjectType: SubjectReportTarget,
			SubjectID:   "article:raid",
			ObservedAt:  now.Add(-time.Duration(i) * 5 * time.Minute),
		})
	}
	out := PolicyV1.Evaluate(SubjectReportTarget, "article:raid", facts, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim : attendu needs_review, obtenu %s", out.Decision)
	}
}

func TestPolicyV1_ReportsSpreadAcrossTargetsIsAllow(t *testing.T) {
	now := time.Now()
	// 50 signalements en 1 h mais contre 50 cibles différentes : pas un raid,
	// juste une communauté active.
	var facts []Fact
	for i := 0; i < 50; i++ {
		facts = append(facts, Fact{
			Type:        SignalReportFiled,
			SubjectType: SubjectReportTarget,
			SubjectID:   string(rune('a'+i%26)) + string(rune('0'+i/26)),
			ObservedAt:  now.Add(-time.Duration(i) * time.Minute),
		})
	}
	if out := PolicyV1.Evaluate(SubjectReportTarget, facts[0].SubjectID, facts, now); out.Decision != DecisionAllow {
		t.Fatalf("signalements dispersés : attendu allow, obtenu %s", out.Decision)
	}
}

func TestPolicyV1_MostSevereWinsReasonsAccumulate(t *testing.T) {
	// Deux règles déclenchées : la plus sévère gagne, les raisons se
	// cumulent (l'explication reste complète même à verdict unique).
	p := Policy{Name: "test", Version: "t1", Rules: []BurstRule{
		{SignalType: "x", SubjectScope: "s", Window: time.Hour, Threshold: 2, Result: DecisionNeedsReview, Reason: "r.review"},
		{SignalType: "x", SubjectScope: "s", Window: time.Hour, Threshold: 2, Result: DecisionSuspend, Reason: "r.suspend"},
	}}
	now := time.Now()
	out := p.Evaluate("s", "z", []Fact{
		{Type: "x", SubjectType: "s", SubjectID: "z", ObservedAt: now},
		{Type: "x", SubjectType: "s", SubjectID: "z", ObservedAt: now},
		// Fait parasite d'un autre sujet : ignoré (ne fait pas monter le
		// compteur de z, ne déclenche pas de raison fantôme).
		{Type: "x", SubjectType: "s", SubjectID: "autre", ObservedAt: now},
	}, now)
	if out.Decision != DecisionSuspend {
		t.Fatalf("attendu suspend (plus sévère), obtenu %s", out.Decision)
	}
	if len(out.Reasons) != 2 {
		t.Fatalf("raisons cumulées attendues (2), obtenu %v", out.Reasons)
	}
}

// TIMESTAMP(3) arrondit à la milliseconde : un fait enregistré « maintenant »
// peut être relu ~1 ms dans le futur. Sans tolérance, le fait le plus récent
// d'une rafale sort de sa propre fenêtre (10 signaux → allow). Au-delà d'1 s,
// anomalie d'horloge : exclu.
func TestMatch_FutureTolerance(t *testing.T) {
	now := time.Now()
	rule := PolicyV1.Rules[0] // signup-burst
	rounding := Fact{Type: SignalSignupAttempt, SubjectType: SubjectPublication, SubjectID: "p", ObservedAt: now.Add(500 * time.Millisecond)}
	if !rule.Match(rounding, SubjectPublication, "p", now) {
		t.Fatal("fait +500 ms (arrondi) : doit compter")
	}
	skew := Fact{Type: SignalSignupAttempt, SubjectType: SubjectPublication, SubjectID: "p", ObservedAt: now.Add(2 * time.Second)}
	if rule.Match(skew, SubjectPublication, "p", now) {
		t.Fatal("fait +2 s (anomalie) : doit être exclu")
	}
}

// Volume du reporter (fiche 06 §10) : 10 signalements/h par le MÊME
// reporter (toutes cibles) → revue DU REPORTER. 9 signalements ou 10
// signalements de 10 reporters différents → allow.
func TestPolicyV1_ReportVolumeNeedsReview(t *testing.T) {
	now := time.Now()
	var facts []Fact
	for i := 0; i < 10; i++ {
		facts = append(facts, Fact{
			Type:        SignalReportVolume,
			SubjectType: SubjectUser,
			SubjectID:   "reporter-raid",
			ObservedAt:  now.Add(-time.Duration(i) * 5 * time.Minute),
		})
	}
	out := PolicyV1.Evaluate(SubjectUser, "reporter-raid", facts, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("raid de signalement : attendu needs_review, obtenu %s", out.Decision)
	}
	if len(out.Reasons) != 1 || out.Reasons[0] != "swarm.report.reporter" {
		t.Fatalf("raison attendue [swarm.report.reporter], obtenu %v", out.Reasons)
	}
}

func TestPolicyV1_ReportVolumeBelowThresholdIsAllow(t *testing.T) {
	now := time.Now()
	var facts []Fact
	for i := 0; i < 9; i++ {
		facts = append(facts, Fact{
			Type:        SignalReportVolume,
			SubjectType: SubjectUser,
			SubjectID:   "reporter-actif",
			ObservedAt:  now.Add(-time.Duration(i) * 5 * time.Minute),
		})
	}
	if out := PolicyV1.Evaluate(SubjectUser, "reporter-actif", facts, now); out.Decision != DecisionAllow {
		t.Fatalf("9 signalements : attendu allow, obtenu %s", out.Decision)
	}
}

// Politique v2 : les règles v1 sont reprises à l'identique (rejouabilité
// historique) + l'engagement inauthentique. 49 likes = succès, 50 = revue.
func TestPolicyV2_InheritsV1(t *testing.T) {
	if len(PolicyV2.Rules) != len(PolicyV1.Rules)+2 {
		t.Fatalf("v2 = v1 + 2 règles likes, obtenu %d règles", len(PolicyV2.Rules))
	}
	for i, r := range PolicyV1.Rules {
		if PolicyV2.Rules[i] != r {
			t.Fatalf("règle v1 %d modifiée en v2 (les politiques ne s'éditent pas)", i)
		}
	}
	if PolicyV2.Version == PolicyV1.Version {
		t.Fatal("nouvelle politique = nouvelle version")
	}
}

func TestPolicyV2_LikeSwarmNeedsReview(t *testing.T) {
	now := time.Now()
	var facts []Fact
	for i := 0; i < 50; i++ {
		facts = append(facts, Fact{
			Type:        SignalLikeCast,
			SubjectType: SubjectLikeTarget,
			SubjectID:   "post:viral",
			ObservedAt:  now.Add(-time.Duration(i) * 10 * time.Second),
		})
	}
	out := PolicyV2.Evaluate(SubjectLikeTarget, "post:viral", facts, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("essaim de likes : attendu needs_review, obtenu %s", out.Decision)
	}
	// 49 = en dessous du seuil : succès, pas revue.
	out = PolicyV2.Evaluate(SubjectLikeTarget, "post:viral", facts[:49], now)
	if out.Decision != DecisionAllow {
		t.Fatalf("49 likes : attendu allow, obtenu %s", out.Decision)
	}
}

func TestPolicyV2_LikeVolumeNeedsReview(t *testing.T) {
	now := time.Now()
	var facts []Fact
	for i := 0; i < 100; i++ {
		facts = append(facts, Fact{
			Type:        SignalLikeVolume,
			SubjectType: SubjectUser,
			SubjectID:   "liker-farm",
			ObservedAt:  now.Add(-time.Duration(i) * 30 * time.Second),
		})
	}
	out := PolicyV2.Evaluate(SubjectUser, "liker-farm", facts, now)
	if out.Decision != DecisionNeedsReview {
		t.Fatalf("volume de likes : attendu needs_review, obtenu %s", out.Decision)
	}
	if len(out.Reasons) != 1 || out.Reasons[0] != "swarm.like.liker" {
		t.Fatalf("raison attendue [swarm.like.liker], obtenu %v", out.Reasons)
	}
}

func TestSeverity_UnknownNeverWins(t *testing.T) {
	if Severity(Decision("nuke")) >= Severity(DecisionAllow) {
		t.Fatal("une décision inconnue ne doit jamais gagner contre allow")
	}
}
