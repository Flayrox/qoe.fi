package legal

// Tests de non-régression de l'audit L29f : chaque cas échoue sur le code
// d'avant le correctif (bornes d'export ignorées, export tronqué, brouillons
// dans une pièce remise à un tiers, rotation de clé prise pour une altération,
// suppression d'un document qui efface les preuves, dates invalides acceptées,
// brouillon de revue jamais rattaché, consentement d'inscription sans version).

import (
	"context"
	"testing"
	"time"

	db "github.com/qoefi/api/internal/database"
)

// ─── Preuves de consentement ─────────────────────────────────────────

func TestLegal_DeleteDocumentPreservesAcceptances(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	if _, err := svc.Accept(ctx, legalReaderID, doc.Slug, AcceptInput{Locale: "fr"}); err != nil {
		t.Fatalf("accept: %v", err)
	}

	if err := svc.DeleteDocument(ctx, legalAdminID, doc.ID); !IsConflict(err) {
		t.Fatalf("suppression d'un document porteur de preuves = %v, attendu errConflict", err)
	}
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_acceptance WHERE document_id = $1`, doc.ID).Scan(&count); err != nil {
		t.Fatalf("comptage: %v", err)
	}
	if count != 1 {
		t.Fatalf("preuves restantes = %d, attendu 1", count)
	}
}

// ─── Cycle de vie ────────────────────────────────────────────────────

func TestLegal_OpenReviewRejectsInvalidDueAt(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	if _, err := svc.OpenReview(ctx, legalAdminID, "conditions-generales-de-vente", "pas-une-date", ""); !IsInvalid(err) {
		t.Fatalf("date d'échéance illisible acceptée (err=%v), attendu errInvalid", err)
	}
}

func TestLegal_LifecycleAttachesExistingReviewDraft(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	base, err := svc.q.GetReferencePublishedVersion(ctx, doc.ID)
	if err != nil {
		t.Fatalf("version de référence: %v", err)
	}
	due := time.Now().UTC().AddDate(0, 0, 10)
	review, err := svc.q.UpsertLegalReview(ctx, db.UpsertLegalReviewParams{
		DocumentID: doc.ID,
		RuleKey:    "audit-l29f",
		DueAt:      pgTimestamp(due),
		Notes:      optText("revue de test"),
	})
	if err != nil {
		t.Fatalf("revue: %v", err)
	}
	// Le brouillon existe déjà (créé par un passage antérieur) mais la revue
	// ne le référence pas : le cycle doit le rattacher, pas renoncer.
	label := reviewVersionLabel(base.Version, &due)
	if _, err := svc.q.InsertLegalDocumentVersion(ctx, db.InsertLegalDocumentVersionParams{
		DocumentID: doc.ID,
		Locale:     base.Locale,
		Version:    label,
		Title:      "Reprise de la revue",
		Summary:    "reprise",
		Body:       "corps",
	}); err != nil {
		t.Fatalf("brouillon existant: %v", err)
	}
	open, err := svc.q.ListOpenLegalReviews(ctx)
	if err != nil {
		t.Fatalf("revues ouvertes: %v", err)
	}
	seen := false
	for _, r := range open {
		if r.ID == review.ID {
			seen = true
		}
	}
	if !seen {
		t.Fatal("la revue de test n'est pas listée comme ouverte")
	}
	if _, err := svc.q.GetLegalDocumentVersionByLabel(ctx, db.GetLegalDocumentVersionByLabelParams{
		DocumentID: doc.ID, Locale: base.Locale, Version: label,
	}); err != nil {
		t.Fatalf("brouillon introuvable par libellé %q: %v", label, err)
	}

	run, err := svc.RunLifecycle(ctx, time.Now())
	if err != nil {
		t.Fatalf("cycle: %v", err)
	}
	if len(run.Errors) > 0 {
		t.Fatalf("cycle en erreur: %v", run.Errors)
	}
	reviews, err := svc.AdminReviews(ctx, legalAdminID, 500)
	if err != nil {
		t.Fatalf("revues: %v", err)
	}
	var found *LegalReview
	for i := range reviews {
		if reviews[i].ID == review.ID {
			found = &reviews[i]
		}
	}
	if found == nil {
		t.Fatal("revue introuvable après le cycle")
	}
	if found.DraftVersionID == nil || *found.DraftVersionID == "" {
		t.Fatal("brouillon existant jamais rattaché à la revue : la revue reste bloquée à chaque passage")
	}
}

func TestLegal_CreateVersionRejectsInvalidEffectiveAt(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	_, err = svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "1.1.0-audit", Title: "T", Body: "B",
		EffectiveAt: "2026-13-45",
	})
	if !IsInvalid(err) {
		t.Fatalf("date d'effet illisible acceptée (err=%v), attendu errInvalid", err)
	}
}

func TestLegal_UpdateVersionRejectsEmptyContent(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)
	doc, err := svc.q.GetLegalDocumentBySlug(ctx, "conditions-generales-utilisation")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	draft, err := svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "1.2.0-audit", Title: "Titre", Body: "Corps",
	})
	if err != nil {
		t.Fatalf("brouillon: %v", err)
	}
	if _, err := svc.UpdateVersion(ctx, legalAdminID, draft.ID, SaveVersionInput{Title: "Titre", Body: "  "}); !IsInvalid(err) {
		t.Fatalf("publication d'un texte vide acceptée (err=%v), attendu errInvalid", err)
	}
}

func TestLegal_ComplianceCoverageIsClamped(t *testing.T) {
	coverage, _, _ := evaluateDocument(ComplianceDocument{
		RequiresAcceptance: true,
		PublishedLocales:   1,
		CurrentAcceptances: 5,
	}, 2)
	if coverage != 100 {
		t.Fatalf("couverture = %d %%, attendu 100 (bornée)", coverage)
	}
}
