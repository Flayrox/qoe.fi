package legal

import (
	"context"
	"testing"
)

// Fiche 04 §11 : exiger une acceptation sans permettre un refus, c'est un
// consentement forcé. Le refus explicite est tracé (qui, quelle version,
// quand), distinct de l'absence, et ne bloque ni l'export ni la suppression.

// DeclineBatch refuse des versions publiées : une ligne par slug, idempotent,
// sans toucher aux acceptations.
func TestLegal_DeclineBatch(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	slugs, err := svc.DeclineBatch(ctx, legalReaderID, BatchDeclineInput{
		Locale: "fr",
		Slugs:  []string{"conditions-generales-utilisation", "politique-confidentialite"},
	})
	if err != nil {
		t.Fatalf("decline: %v", err)
	}
	if len(slugs) != 2 {
		t.Fatalf("refusés = %d, attendu 2", len(slugs))
	}

	// Idempotent : refuser deux fois ne crée pas de doublon.
	slugs, err = svc.DeclineBatch(ctx, legalReaderID, BatchDeclineInput{
		Locale: "fr",
		Slugs:  []string{"conditions-generales-utilisation"},
	})
	if err != nil {
		t.Fatalf("re-decline: %v", err)
	}
	if len(slugs) != 1 {
		t.Fatalf("re-refusés = %d, attendu 1", len(slugs))
	}
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM legal_refusal WHERE user_id = $1::uuid`, legalReaderID).Scan(&count); err != nil {
		t.Fatalf("count refusals: %v", err)
	}
	if count != 2 {
		t.Fatalf("lignes de refus = %d, attendu 2 (pas de doublon)", count)
	}

	// Un slug inconnu n'annule pas les autres refus.
	slugs, err = svc.DeclineBatch(ctx, legalReaderID, BatchDeclineInput{
		Locale: "fr",
		Slugs:  []string{"document-inexistant", "politique-confidentialite"},
	})
	if err != nil {
		t.Fatalf("decline mixte: %v", err)
	}
	if len(slugs) != 1 || slugs[0] != "politique-confidentialite" {
		t.Fatalf("refusés = %v, attendu [politique-confidentialite]", slugs)
	}
}

// Refuser n'est pas « désaccepter » : les acceptations existantes survivent,
// et accepter après avoir refusé reste possible (l'historique montre les
// deux, dans l'ordre, sans réécriture).
func TestLegal_DeclineDoesNotTouchAcceptances(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	accepted, err := svc.AcceptBatch(ctx, legalReaderID, BatchAcceptInput{
		Locale: "fr",
		Slugs:  []string{"conditions-generales-utilisation"},
	})
	if err != nil || len(accepted) != 1 {
		t.Fatalf("accept: %v %d", err, len(accepted))
	}
	if _, err := svc.DeclineBatch(ctx, legalReaderID, BatchDeclineInput{
		Locale: "fr",
		Slugs:  []string{"conditions-generales-utilisation"},
	}); err != nil {
		t.Fatalf("decline: %v", err)
	}

	var acceptances, refusals int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM legal_acceptance WHERE user_id = $1::uuid`, legalReaderID).Scan(&acceptances); err != nil {
		t.Fatalf("count acceptances: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM legal_refusal WHERE user_id = $1::uuid`, legalReaderID).Scan(&refusals); err != nil {
		t.Fatalf("count refusals: %v", err)
	}
	if acceptances != 1 || refusals != 1 {
		t.Fatalf("acceptations = %d, refus = %d (attendu 1/1 : les deux coexistent)", acceptances, refusals)
	}
}

// PendingAcceptances distingue l'attente simple, le dépassement de date
// d'effet sans acceptation, et le refus explicite antérieur.
func TestLegal_PendingShowsDeclineAndPastEffective(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	if _, err := svc.DeclineBatch(ctx, legalReaderID, BatchDeclineInput{
		Locale: "fr",
		Slugs:  []string{"politique-confidentialite"},
	}); err != nil {
		t.Fatalf("decline: %v", err)
	}
	items, err := svc.PendingAcceptances(ctx, legalReaderID, "fr")
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	found := false
	for _, item := range items {
		if item.Slug != "politique-confidentialite" {
			continue
		}
		found = true
		// Le document reste « sans acceptation » (pas de contournement) mais
		// le refus est visible (pas de relance aveugle).
		if item.DeclinedAt == nil {
			t.Fatal("refus explicite invisible dans les en-attente")
		}
	}
	if !found {
		t.Fatal("document refusé sorti de la liste : refuser ne doit pas faire disparaître l'obligation d'informer")
	}
}
