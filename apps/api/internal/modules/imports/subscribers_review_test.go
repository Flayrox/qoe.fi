package imports

import "testing"

// La vue demandeur est construite à partir du même dossier que la vue staff :
// si le dépouillement saute, les signaux de risque et le journal d'audit
// partent au créateur. Le contrat est « bilan agrégé et décisions
// communicables », pas « dossier d'enquête ».
func TestRequesterReviewView_RetireSignauxEtJournal(t *testing.T) {
	in := SubscriberImportReviewDTO{
		Batch:     SubscriberImportBatchDTO{ID: "b1", Status: BatchSubmitted},
		Rows:      []SubscriberImportRowDTO{{Email: "a@b.fr", Status: RowPendingConfirmation}},
		RowCounts: map[string]int{RowPendingConfirmation: 1},
		Signals: SubscriberImportSignals{
			PreviousBatches:       4,
			PreviousRejected:      2,
			PreviousSuspended:     1,
			SameFileFingerprint:   true,
			CrossBatchDuplicates:  7,
			PublisherName:         "Journal",
			RequesterEmail:        "createur@example.com",
			RequesterPhoneChecked: true,
		},
		Events:    []SubscriberImportEventDTO{{Type: "decision", ActorKind: "staff"}},
		SendWaves: []SendWaveDTO{{ID: "w1", Status: "queued"}},
		Decisions: []SubscriberImportDecisionDTO{{ID: "d1", Decision: "rejected", PublicReason: "motif public"}},
	}

	got := requesterReviewView(in)

	if got.Signals != (SubscriberImportSignals{}) {
		t.Fatalf("signaux internes encore exposés : %+v", got.Signals)
	}
	if len(got.Events) != 0 {
		t.Fatalf("journal d'audit encore exposé : %+v", got.Events)
	}
	// Le reste du dossier doit rester lisible : on retire l'analyse, pas le lot.
	if got.Batch.ID != "b1" || len(got.Rows) != 1 || got.RowCounts[RowPendingConfirmation] != 1 {
		t.Fatalf("le dossier du demandeur a été vidé : %+v", got)
	}
	if len(got.SendWaves) != 1 || len(got.Decisions) != 1 {
		t.Fatalf("avancement ou décisions publiques perdus : %+v", got)
	}
	if got.Decisions[0].InternalReason != "" {
		t.Fatal("le motif interne doit rester absent de la vue demandeur")
	}
	// La valeur d'entrée n'est pas modifiée en place : la vue staff peut être
	// construite à partir du même dossier.
	if in.Signals.PreviousRejected != 2 || len(in.Events) != 1 {
		t.Fatal("requesterReviewView a muté le dossier source")
	}
}
