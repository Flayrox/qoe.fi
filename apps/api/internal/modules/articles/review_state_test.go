package articles

import "testing"

// Rejeter les modifications d'un article DÉJÀ EN LIGNE ne doit jamais changer
// son état public : la résolution canonique (GetByShortCode) et le worker de
// recherche filtrent sur status='PUBLISHED'. Un status DRAFT + published=true
// casse silencieusement les liens partagés d'un article toujours en ligne.
func TestReviewTargetState_RejectKeepsPublishedArticleLive(t *testing.T) {
	status, published := reviewTargetState(false, true)
	if !published {
		t.Fatalf("rejet sur article en ligne : published=%v (l'article quitte le site)", published)
	}
	if status != "PUBLISHED" {
		t.Fatalf("rejet sur article en ligne : status=%q, attendu PUBLISHED (liens courts cassés)", status)
	}
}

func TestReviewTargetState_ApprovePublishes(t *testing.T) {
	status, published := reviewTargetState(true, false)
	if status != "PUBLISHED" || !published {
		t.Fatalf("approbation : (%q, %v), attendu (PUBLISHED, true)", status, published)
	}
}

func TestReviewTargetState_RejectDraftStaysDraft(t *testing.T) {
	status, published := reviewTargetState(false, false)
	if status != "DRAFT" || published {
		t.Fatalf("rejet d'un brouillon : (%q, %v), attendu (DRAFT, false)", status, published)
	}
}
