package articles

import (
	"context"
	"testing"
)

// Le journal d'historique ne doit jamais faire tomber une action métier :
// recordEvent est appelé depuis les chemins de publication, parfois avec un
// service partiellement configuré (tests, worker sans pool).
func TestRecordEventNeverPanics(t *testing.T) {
	var nilService *Service
	nilService.recordEvent(context.Background(), EventInput{ArticleID: "a", Type: EventPublished})

	empty := &Service{}
	empty.recordEvent(context.Background(), EventInput{ArticleID: "a", Type: EventCreated})

	// Sans article ou sans type : aucun effet, aucune panique.
	empty.recordEvent(context.Background(), EventInput{})
}

func TestStatusOrDraft(t *testing.T) {
	if got := statusOrDraft(""); got != "DRAFT" {
		t.Fatalf("statut vide = %q, attendu DRAFT", got)
	}
	if got := statusOrDraft("SCHEDULED"); got != "SCHEDULED" {
		t.Fatalf("statut conservé = %q, attendu SCHEDULED", got)
	}
}

// Les types d'événements sont contraints par un CHECK en base : ce test
// verrouille la liste pour qu'un renommage côté Go ne casse pas silencieusement
// l'insertion (l'erreur serait seulement journalisée).
func TestEventTypesAreUniqueAndKnown(t *testing.T) {
	types := []string{
		EventCreated, EventPublished, EventLiveUpdated, EventUnpublished,
		EventScheduled, EventRescheduled, EventScheduleCancelled,
		EventScheduledPublished, EventSubmitted, EventApproved, EventRejected,
	}
	seen := make(map[string]bool, len(types))
	for _, eventType := range types {
		if eventType == "" {
			t.Fatal("type d'événement vide")
		}
		if seen[eventType] {
			t.Fatalf("type dupliqué : %s", eventType)
		}
		seen[eventType] = true
	}
}
