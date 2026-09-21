package workers

import (
	"context"
	"strings"
	"testing"
)

// seedLegalNoticeFixtures prépare un document publié, un avis et une livraison
// QUEUED pour son destinataire.
func seedLegalNoticeFixtures(t *testing.T, deliveryID string) {
	requirePool(t)
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE legal_notice_delivery, legal_notice, legal_document_version, legal_document, "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
		 VALUES ('10000000-0000-0000-0000-0000000000f1', 'reader@test.dev', 'Lecteur', 'user', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document (id, slug, category, audience, requires_acceptance, is_active, sort_order)
		 VALUES ('doc_legal_1', 'conditions-generales-utilisation', 'legal', 'all', true, true, 20)`); err != nil {
		t.Fatalf("document: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_document_version (id, document_id, locale, version, title, summary, body, status, published_at)
		 VALUES ('ver_legal_1', 'doc_legal_1', 'fr', '1.1.0', 'Conditions générales d''utilisation', 's', 'corps', 'PUBLISHED', now())`); err != nil {
		t.Fatalf("version: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_notice (id, document_id, version_id, locale, version, title, changelog, portal_path, created_at)
		 VALUES ('notice_1', 'doc_legal_1', 'ver_legal_1', 'fr', '1.1.0',
		         'Conditions générales d''utilisation', 'Clause de résiliation précisée',
		         '/legal/conditions-generales-utilisation', now())`); err != nil {
		t.Fatalf("notice: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_notice_delivery (id, notice_id, user_id, email, status, attempts, available_at, created_at, updated_at)
		 VALUES ($1, 'notice_1', '10000000-0000-0000-0000-0000000000f1', 'reader@test.dev', 'QUEUED', 0, now() - interval '1 hour', now(), now())`,
		deliveryID); err != nil {
		t.Fatalf("delivery: %v", err)
	}
}

func TestLegalNotice_DrainSendsChangelogAndLink(t *testing.T) {
	seedLegalNoticeFixtures(t, "del_legal_ok")

	stub := &stubEmailProvider{name: "stub"}
	sent, failed, err := drainLegalNoticesOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://qoe.fi", 50)
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
	if msg.To != "reader@test.dev" || !strings.Contains(msg.Subject, "nouvelle version") {
		t.Fatalf("message inattendu: to=%q subject=%q", msg.To, msg.Subject)
	}
	// Le contenu doit dire trois choses : quel document, ce qui change, et où
	// renouveler (ou retirer) son consentement.
	if !strings.Contains(msg.HTML, "Conditions générales d&#39;utilisation") {
		t.Errorf("titre du document absent: %s", msg.HTML)
	}
	if !strings.Contains(msg.HTML, "Clause de résiliation précisée") {
		t.Errorf("changelog absent de l'email: %s", msg.HTML)
	}
	if !strings.Contains(msg.HTML, "https://qoe.fi/legal/conditions-generales-utilisation") {
		t.Errorf("lien de re-consentement absent: %s", msg.HTML)
	}
	if !strings.Contains(msg.HTML, "Lecteur") {
		t.Errorf("destinataire non nommé: %s", msg.HTML)
	}

	var status, provider string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, provider FROM legal_notice_delivery WHERE id = 'del_legal_ok'`).Scan(&status, &provider); err != nil {
		t.Fatal(err)
	}
	if status != "SENT" || provider != "stub" {
		t.Fatalf("statut=%q provider=%q, attendu SENT/stub", status, provider)
	}

	// Deuxième passage : plus rien à envoyer (pas de doublon).
	sent, _, err = drainLegalNoticesOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain 2: %v", err)
	}
	if sent != 0 || len(stub.sent) != 1 {
		t.Fatalf("un email a été renvoyé: sent=%d total=%d", sent, len(stub.sent))
	}
}

func TestLegalNotice_DrainMarksFailureForRetry(t *testing.T) {
	seedLegalNoticeFixtures(t, "del_legal_fail")

	stub := &stubEmailProvider{name: "stub", err: context.DeadlineExceeded}
	sent, failed, err := drainLegalNoticesOnce(
		context.Background(), poolTest, stub, "noreply@qoe.fi", "https://qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 0 || failed != 1 {
		t.Fatalf("sent=%d failed=%d, attendu 0/1", sent, failed)
	}

	var status, lastError string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, COALESCE(last_error, '') FROM legal_notice_delivery WHERE id = 'del_legal_fail'`).
		Scan(&status, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != "FAILED" || lastError == "" {
		t.Fatalf("statut=%q lastError=%q, attendu FAILED avec erreur exploitable", status, lastError)
	}
}

// flakyProvider échoue une fois puis réussit : on vérifie qu'un envoi raté
// n'empêche pas les suivants de partir dans le même passage.
type flakyProvider struct {
	stubEmailProvider
	failuresLeft int
}

func (f *flakyProvider) Send(ctx context.Context, m EmailMessage) error {
	if f.failuresLeft > 0 {
		f.failuresLeft--
		return context.DeadlineExceeded
	}
	return f.stubEmailProvider.Send(ctx, m)
}

// Un envoi qui échoue ne bloque pas la file : les avis suivants partent dans le
// même passage, et l'échec reste visible pour une reprise.
func TestLegalNotice_DrainContinuesAfterFailure(t *testing.T) {
	seedLegalNoticeFixtures(t, "del_legal_a")
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
		 VALUES ('10000000-0000-0000-0000-0000000000f2', 'second@test.dev', 'Second', 'user', now(), now())`); err != nil {
		t.Fatalf("user b: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO legal_notice_delivery (id, notice_id, user_id, email, status, attempts, available_at, created_at, updated_at)
		 VALUES ('del_legal_b', 'notice_1', '10000000-0000-0000-0000-0000000000f2', 'second@test.dev', 'QUEUED', 0, now() - interval '2 hours', now(), now())`); err != nil {
		t.Fatalf("delivery b: %v", err)
	}

	flaky := &flakyProvider{stubEmailProvider: stubEmailProvider{name: "flaky"}, failuresLeft: 1}
	sent, failed, err := drainLegalNoticesOnce(ctx, poolTest, flaky, "noreply@qoe.fi", "https://qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 1 || failed != 1 {
		t.Fatalf("sent=%d failed=%d, attendu 1/1", sent, failed)
	}

	var failedCount int
	if err := poolTest.QueryRow(ctx,
		`SELECT count(*) FROM legal_notice_delivery WHERE status = 'FAILED'`).Scan(&failedCount); err != nil {
		t.Fatal(err)
	}
	if failedCount != 1 {
		t.Fatalf("livraisons en échec = %d, attendu 1 (reprise traçable)", failedCount)
	}
}

// L'absence de fournisseur désactive le drain sans erreur (les avis restent
// en file : ils partiront dès qu'un fournisseur est configuré).
func TestLegalNotice_NoProviderIsNoop(t *testing.T) {
	seedLegalNoticeFixtures(t, "del_legal_noprovider")

	sent, failed, err := drainLegalNoticesOnce(
		context.Background(), poolTest, nil, "noreply@qoe.fi", "https://qoe.fi", 50)
	if err != nil || sent != 0 || failed != 0 {
		t.Fatalf("sent=%d failed=%d err=%v, attendu 0/0/nil", sent, failed, err)
	}

	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM legal_notice_delivery WHERE id = 'del_legal_noprovider'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "QUEUED" {
		t.Fatalf("statut=%q, attendu QUEUED (rien ne doit être consommé sans fournisseur)", status)
	}
}
