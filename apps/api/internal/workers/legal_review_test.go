package workers

import (
	"context"
	"strings"
	"testing"
)

// seedReviewReminderFixture prépare une revue en retard, son brouillon et un
// rappel QUEUED pour le superadmin.
func seedReviewReminderFixture(t *testing.T, stage, reminderID string) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE legal_review_reminder, legal_review, legal_document_version, legal_document, "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
		 VALUES ('20000000-0000-0000-0000-0000000000f1', 'admin@test.dev', 'Adèle', 'superadmin', now(), now())`); err != nil {
		t.Fatalf("admin: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document (id, slug, category, audience, requires_acceptance, is_active, sort_order)
		 VALUES ('doc_review_1', 'politique-cookies', 'privacy', 'all', false, true, 40)`); err != nil {
		t.Fatalf("document: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document_version (id, document_id, locale, version, title, summary, body, status, published_at)
		 VALUES ('ver_review_1', 'doc_review_1', 'fr', '1.0.0', 'Politique de cookies et traceurs', 's', 'corps', 'PUBLISHED', now())`); err != nil {
		t.Fatalf("version publiée: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document_version (id, document_id, locale, version, title, summary, body, status, published_at)
		 VALUES ('ver_review_draft', 'doc_review_1', 'fr', '1.0.0-revue-20260901', 'Politique de cookies et traceurs', 's', 'corps', 'DRAFT', NULL)`); err != nil {
		t.Fatalf("brouillon: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_review (id, document_id, rule_key, due_at, status, draft_version_id, notes, opened_at)
		 VALUES ('rev_1', 'doc_review_1', 'cookies-review', now() - interval '10 days', 'DRAFTED',
		         'ver_review_draft', 'Revue de la politique de cookies — art. 82 LIL', now())`); err != nil {
		t.Fatalf("revue: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_review_reminder (id, review_id, user_id, email, stage, status, attempts, available_at, created_at, updated_at)
		 VALUES ($1, 'rev_1', '20000000-0000-0000-0000-0000000000f1', 'admin@test.dev', $2, 'QUEUED', 0, now() - interval '1 hour', now(), now())`,
		reminderID, stage); err != nil {
		t.Fatalf("rappel: %v", err)
	}
}

func TestLegalReview_DrainSendsOverdueReminder(t *testing.T) {
	seedReviewReminderFixture(t, "OVERDUE", "rem_overdue")

	stub := &stubEmailProvider{name: "stub"}
	sent, failed, err := drainLegalReviewRemindersOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://admin.qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 1 || failed != 0 {
		t.Fatalf("sent=%d failed=%d, attendu 1/0", sent, failed)
	}
	if len(stub.sent) != 1 {
		t.Fatalf("messages envoyés = %d", len(stub.sent))
	}
	msg := stub.sent[0]
	if msg.To != "admin@test.dev" {
		t.Fatalf("destinataire = %q", msg.To)
	}
	// Un rappel doit dire de quel texte il parle et ce qu'il y a à faire.
	if !strings.Contains(msg.Subject, "Retard") && !strings.Contains(msg.Subject, "retard") {
		t.Errorf("l'objet doit signaler le retard: %q", msg.Subject)
	}
	if !strings.Contains(msg.Subject, "Politique de cookies") {
		t.Errorf("l'objet doit nommer le document: %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "Adèle") {
		t.Errorf("le superadmin doit être nommé: %s", msg.HTML)
	}
	// Le motif légal de l'échéance est repris : celui qui reçoit le rappel doit
	// pouvoir vérifier d'où il sort.
	if !strings.Contains(msg.HTML, "art. 82 LIL") {
		t.Errorf("la référence légale est absente: %s", msg.HTML)
	}
	// Le brouillon déjà préparé change ce qu'il y a à faire : on le dit.
	if !strings.Contains(msg.HTML, "1.0.0-revue-20260901") {
		t.Errorf("le brouillon prêt n'est pas mentionné: %s", msg.HTML)
	}
	if !strings.Contains(msg.HTML, "https://admin.qoe.fi/admin/compliance") {
		t.Errorf("le lien vers la console est absent: %s", msg.HTML)
	}

	// L'issue est persistée : un rappel envoyé n'est pas renvoyé.
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM legal_review_reminder WHERE id = 'rem_overdue'`).Scan(&status); err != nil {
		t.Fatalf("relecture: %v", err)
	}
	if status != "SENT" {
		t.Fatalf("statut = %s, attendu SENT", status)
	}

	// Deuxième passage : plus rien à envoyer.
	sent2, _, err := drainLegalReviewRemindersOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://admin.qoe.fi", 50)
	if err != nil {
		t.Fatalf("second drain: %v", err)
	}
	if sent2 != 0 {
		t.Fatalf("le rappel a été envoyé deux fois (sent=%d)", sent2)
	}
}

func TestLegalReview_DrainReportsFailure(t *testing.T) {
	seedReviewReminderFixture(t, "DRAFTED", "rem_draft")

	stub := &stubEmailProvider{name: "stub", err: context.DeadlineExceeded}
	sent, failed, err := drainLegalReviewRemindersOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://admin.qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 0 || failed != 1 {
		t.Fatalf("sent=%d failed=%d, attendu 0/1", sent, failed)
	}
	// Un échec doit être rejouable : la ligne garde l'erreur et repart plus tard.
	var status, lastError string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, COALESCE(last_error, '') FROM legal_review_reminder WHERE id = 'rem_draft'`,
	).Scan(&status, &lastError); err != nil {
		t.Fatalf("relecture: %v", err)
	}
	if status != "FAILED" || lastError == "" {
		t.Fatalf("statut=%q lastError=%q, attendu FAILED avec erreur", status, lastError)
	}
}
