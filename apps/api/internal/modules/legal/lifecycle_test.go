package legal

// Tests du cycle de vie légal : une échéance doit produire une revue, un
// brouillon, un rappel — et une publication planifiée doit emprunter le même
// chemin qu'une publication manuelle (archivage, avis, clôture de revue).

import (
	"context"
	"strings"
	"testing"
	"time"
)

// agePublishedVersion antidate la publication d'un document pour simuler une
// échéance atteinte, sans dépendre de l'horloge du test.
func agePublishedVersion(t *testing.T, ctx context.Context, slug string, age time.Duration) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `
		UPDATE legal_document_version v
		SET published_at = now() - ($2::text)::interval
		FROM legal_document d
		WHERE v.document_id = d.id AND d.slug = $1 AND v.status = 'PUBLISHED'`,
		slug, age.String()); err != nil {
		t.Fatalf("antidater %s: %v", slug, err)
	}
}

func reviewFor(t *testing.T, ctx context.Context, slug string) (status, draftID string) {
	t.Helper()
	err := poolTest.QueryRow(ctx, `
		SELECT r.status, COALESCE(r.draft_version_id, '')
		FROM legal_review r
		JOIN legal_document d ON d.id = r.document_id
		WHERE d.slug = $1
		ORDER BY r.due_at DESC LIMIT 1`, slug).Scan(&status, &draftID)
	if err != nil {
		t.Fatalf("revue de %s introuvable: %v", slug, err)
	}
	return status, draftID
}

func TestLegal_LifecycleOpensReviewDraftAndReminder(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	// La politique de cookies devait être revue tous les 6 mois : on la place
	// à 200 jours, donc en retard.
	agePublishedVersion(t, ctx, "politique-cookies", 200*24*time.Hour)

	run, err := svc.RunLifecycle(ctx, time.Now())
	if err != nil {
		t.Fatalf("cycle: %v", err)
	}
	if run.ReviewsOpened != 1 {
		t.Fatalf("revues ouvertes = %d, attendu 1 (une seule échéance dépassée)", run.ReviewsOpened)
	}
	if run.DraftsProposed != 1 {
		t.Fatalf("brouillons proposés = %d, attendu 1", run.DraftsProposed)
	}
	if len(run.Errors) != 0 {
		t.Fatalf("cycle en erreur: %v", run.Errors)
	}

	status, draftID := reviewFor(t, ctx, "politique-cookies")
	if status != "DRAFTED" || draftID == "" {
		t.Fatalf("statut = %s, brouillon = %q", status, draftID)
	}

	// Le brouillon reprend le texte publié : relire coûte moins cher que
	// repartir d'une page blanche, c'est tout l'intérêt.
	var version, body, docID string
	if err := poolTest.QueryRow(ctx,
		`SELECT version, body, document_id FROM legal_document_version WHERE id = $1`, draftID,
	).Scan(&version, &body, &docID); err != nil {
		t.Fatalf("brouillon illisible: %v", err)
	}
	if !strings.Contains(version, "-revue-") {
		t.Fatalf("libellé de version = %q, attendu un suffixe -revue-", version)
	}
	if len(body) < 200 {
		t.Fatalf("le brouillon ne reprend pas le texte publié (%d caractères)", len(body))
	}

	// Un rappel, une fois, pour le superadmin, au palier « en retard ».
	var stage string
	if err := poolTest.QueryRow(ctx, `
		SELECT rr.stage FROM legal_review_reminder rr
		JOIN legal_review r ON r.id = rr.review_id
		JOIN legal_document d ON d.id = r.document_id
		WHERE d.slug = 'politique-cookies'`).Scan(&stage); err != nil {
		t.Fatalf("rappel introuvable: %v", err)
	}
	if stage != ReviewStageOverdue {
		t.Fatalf("palier = %s, attendu %s", stage, ReviewStageOverdue)
	}

	// Rejouer le cycle ne duplique rien : c'est une contrainte en base, pas
	// une garde applicative.
	second, err := svc.RunLifecycle(ctx, time.Now())
	if err != nil {
		t.Fatalf("second cycle: %v", err)
	}
	if second.ReviewsOpened != 0 || second.DraftsProposed != 0 || second.RemindersQueued != 0 {
		t.Fatalf("le cycle n'est pas idempotent: %+v", second)
	}
}

func TestLegal_LifecyclePublishesScheduledDraft(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	agePublishedVersion(t, ctx, "politique-cookies", 200*24*time.Hour)
	if _, err := svc.RunLifecycle(ctx, time.Now()); err != nil {
		t.Fatalf("cycle: %v", err)
	}
	_, draftID := reviewFor(t, ctx, "politique-cookies")
	if draftID == "" {
		t.Fatal("aucun brouillon proposé")
	}
	// Version publiée avant la bascule : elle doit être archivée, jamais
	// supprimée (c'est la preuve de ce qui a été en vigueur).
	var previousID string
	if err := poolTest.QueryRow(ctx, `
		SELECT v.id FROM legal_document_version v
		JOIN legal_document d ON d.id = v.document_id
		WHERE d.slug = 'politique-cookies' AND v.status = 'PUBLISHED' AND v.locale = 'fr'
		LIMIT 1`).Scan(&previousID); err != nil {
		t.Fatalf("version publiée précédente: %v", err)
	}

	// La fenêtre planifiée est passée : au prochain passage, la publication
	// part — sans intervention humaine.
	if _, err := poolTest.Exec(ctx,
		`UPDATE legal_document_version SET scheduled_at = now() - interval '1 minute' WHERE id = $1`,
		draftID); err != nil {
		t.Fatalf("planification: %v", err)
	}

	run, err := svc.RunLifecycle(ctx, time.Now())
	if err != nil {
		t.Fatalf("cycle: %v", err)
	}
	if len(run.Published) != 1 || run.Published[0] != draftID {
		t.Fatalf("versions publiées = %v, attendu [%s]", run.Published, draftID)
	}

	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM legal_document_version WHERE id = $1`, draftID).Scan(&status); err != nil {
		t.Fatalf("relecture: %v", err)
	}
	if status != "PUBLISHED" {
		t.Fatalf("statut = %s, attendu PUBLISHED", status)
	}

	// La revue est close : publier le brouillon, c'est avoir fait la revue.
	reviewStatus, _ := reviewFor(t, ctx, "politique-cookies")
	if reviewStatus != "PUBLISHED" {
		t.Fatalf("statut de revue = %s, attendu PUBLISHED", reviewStatus)
	}

	// Même invariant qu'une publication manuelle : une seule version publiée
	// par (document, locale), l'ancienne archivée.
	var previousStatus string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM legal_document_version WHERE id = $1`, previousID).Scan(&previousStatus); err != nil {
		t.Fatalf("relecture de l'ancienne version: %v", err)
	}
	if previousStatus != "ARCHIVED" {
		t.Fatalf("ancienne version = %s, attendu ARCHIVED", previousStatus)
	}
	var publishedCount int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM legal_document_version v
		JOIN legal_document d ON d.id = v.document_id
		WHERE d.slug = 'politique-cookies' AND v.locale = 'fr' AND v.status = 'PUBLISHED'`,
	).Scan(&publishedCount); err != nil {
		t.Fatalf("comptage: %v", err)
	}
	if publishedCount != 1 {
		t.Fatalf("versions publiées = %d, attendu 1", publishedCount)
	}
}

func TestLegal_ScheduleVersionGuards(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	doc, err := svc.q.GetLegalDocumentBySlugAdmin(ctx, "politique-confidentialite")
	if err != nil {
		t.Fatalf("document: %v", err)
	}
	draft, err := svc.CreateVersion(ctx, legalAdminID, doc.ID, SaveVersionInput{
		Locale: "fr", Version: "9.9.9", Title: "Brouillon de test", Body: "Contenu de test suffisant.",
	})
	if err != nil {
		t.Fatalf("création du brouillon: %v", err)
	}

	future := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	scheduled, err := svc.ScheduleVersion(ctx, legalAdminID, draft.ID, future)
	if err != nil {
		t.Fatalf("planification: %v", err)
	}
	if scheduled.EffectiveAt != nil {
		_ = scheduled
	}

	// Une date révolue est refusée : programmer dans le passé, c'est publier
	// sans le dire.
	if _, err := svc.ScheduleVersion(ctx, legalAdminID, draft.ID, time.Now().Add(-2*time.Hour).Format(time.RFC3339)); !IsInvalid(err) {
		t.Fatalf("une fenêtre passée doit être refusée (err=%v)", err)
	}

	// Une version publiée ne se planifie plus.
	published, err := svc.GetPublished(ctx, "politique-confidentialite", "fr")
	if err != nil {
		t.Fatalf("publiée: %v", err)
	}
	if _, err := svc.ScheduleVersion(ctx, legalAdminID, published.VersionID, future); !IsConflict(err) {
		t.Fatalf("planifier une version publiée doit être un conflit (err=%v)", err)
	}

	// Hors superadmin : refusé.
	if _, err := svc.ScheduleVersion(ctx, legalReaderID, draft.ID, future); !IsForbidden(err) {
		t.Fatalf("un non-superadmin ne planifie pas (err=%v)", err)
	}
}

func TestLegal_OpenAndDismissReview(t *testing.T) {
	ctx := context.Background()
	svc := seededService(t)

	review, err := svc.OpenReview(ctx, legalAdminID, "conditions-generales-de-vente", "", "Mise à jour volontaire des CGV")
	if err != nil {
		t.Fatalf("ouverture: %v", err)
	}
	if review.DocumentSlug != "conditions-generales-de-vente" {
		t.Fatalf("document = %s", review.DocumentSlug)
	}
	if review.Status != "DRAFTED" && review.Status != "OPEN" {
		t.Fatalf("statut = %s", review.Status)
	}

	// Clore sans motif est refusé : une revue qui disparaît sans trace serait
	// pire que pas de revue du tout.
	if _, err := svc.DismissReview(ctx, legalAdminID, review.ID, "  "); !IsInvalid(err) {
		t.Fatalf("un motif est requis (err=%v)", err)
	}
	dismissed, err := svc.DismissReview(ctx, legalAdminID, review.ID, "Refonte prévue en janvier")
	if err != nil {
		t.Fatalf("clôture: %v", err)
	}
	if dismissed.Status != "DISMISSED" {
		t.Fatalf("statut = %s, attendu DISMISSED", dismissed.Status)
	}

	if _, err := svc.OpenReview(ctx, legalReaderID, "conditions-generales-de-vente", "", ""); !IsForbidden(err) {
		t.Fatalf("réservé au superadmin (err=%v)", err)
	}
}
