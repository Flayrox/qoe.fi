package workers

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/queue"
)

// fakeProvider enregistre les envois sans toucher au réseau.
type fakeProvider struct {
	sent []EmailMessage
	fail bool
}

func (f *fakeProvider) Name() string { return "fake" }

func (f *fakeProvider) Send(_ context.Context, msg EmailMessage) error {
	if f.fail {
		return errors.New("smtp down")
	}
	f.sent = append(f.sent, msg)
	return nil
}

// TestNewsletterSend_Fanout — HandleNewsletterSend matérialise les livraisons
// (abonnés isActive + receiveArticles), envoie via l'EmailProvider, et clôt
// l'issue avec les compteurs exacts. Un abonné inactif/opt-out ne reçoit rien.
func TestNewsletterSend_Fanout(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{
		`"NewsletterDelivery"`, `"NewsletterIssue"`, `"Subscriber"`, `"Publication"`,
	} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, "updatedAt") VALUES ('pub_nl_test', 'Test Pub', 'test-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	// Abonné actif + opt-in articles → doit recevoir ; actif mais opt-out → non.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "receiveArticles", "updatedAt", "publicationId")
		 VALUES ('sub_nl_1', 'active@test.dev', true, now(), 'pub_nl_test'),
		        ('sub_nl_2', 'muted@test.dev', false, now(), 'pub_nl_test')`); err != nil {
		t.Fatalf("subscribers: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NewsletterIssue" (id, "publicationId", subject, "previewText", html, status, "updatedAt")
		 VALUES ('issue_nl_1', 'pub_nl_test', 'Ma newsletter #1', 'Aperçu', '<h1>Salut</h1>', 'SENDING', now())`); err != nil {
		t.Fatalf("issue: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, err := queue.NewNewsletterSendTask(queue.NewsletterSendPayload{IssueID: "issue_nl_1"})
	if err != nil {
		t.Fatalf("task: %v", err)
	}
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("HandleNewsletterSend: %v", err)
	}

	if len(fake.sent) != 1 {
		t.Fatalf("sent = %d emails, attendu 1 (seul l'abonné opt-in)", len(fake.sent))
	}
	if fake.sent[0].To != "active@test.dev" {
		t.Fatalf("destinataire = %s, attendu active@test.dev", fake.sent[0].To)
	}
	if fake.sent[0].Subject != "Ma newsletter #1" {
		t.Fatalf("sujet = %q, attendu « Ma newsletter #1 »", fake.sent[0].Subject)
	}
	// La coquille brandée embarque le préheader + le lien de désabonnement.
	if !strings.Contains(fake.sent[0].HTML, "Aperçu") || !strings.Contains(fake.sent[0].HTML, "Se désabonner") {
		t.Fatal("coquille email : preheader ou lien de désabonnement absent")
	}

	var status string
	var sent, failed, total int
	if err := poolTest.QueryRow(ctx,
		`SELECT status, "sentCount", "failedCount", "totalRecipients" FROM "NewsletterIssue" WHERE id = 'issue_nl_1'`,
	).Scan(&status, &sent, &failed, &total); err != nil {
		t.Fatalf("issue state: %v", err)
	}
	if status != "SENT" || sent != 1 || failed != 0 || total != 1 {
		t.Fatalf("issue = %s sent=%d failed=%d total=%d, attendu SENT 1/0/1", status, sent, failed, total)
	}

	var deliveryStatus string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "NewsletterDelivery" WHERE "issueId" = 'issue_nl_1' AND email = 'active@test.dev'`,
	).Scan(&deliveryStatus); err != nil {
		t.Fatalf("delivery: %v", err)
	}
	if deliveryStatus != "SENT" {
		t.Fatalf("delivery status = %s, attendu SENT", deliveryStatus)
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "NewsletterDelivery" WHERE "issueId" = 'issue_nl_1'`,
	).Scan(&n); err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if n != 1 {
		t.Fatalf("deliveries = %d, attendu 1 (opt-out exclu)", n)
	}
}

// TestNewsletterSend_Failure — échec SMTP : issue marquée FAILED, la livraison
// porte l'erreur, et le retry ne ré-envoie pas (status != SENDING → no-op).
func TestNewsletterSend_Failure(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{`"NewsletterDelivery"`, `"NewsletterIssue"`, `"Subscriber"`, `"Publication"`} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, "updatedAt") VALUES ('pub_nl_fail', 'Fail Pub', 'fail-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "updatedAt", "publicationId")
		 VALUES ('sub_nl_f1', 'fail@test.dev', now(), 'pub_nl_fail')`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NewsletterIssue" (id, "publicationId", subject, html, status, "updatedAt")
		 VALUES ('issue_nl_f1', 'pub_nl_fail', 'Fail', '<p>x</p>', 'SENDING', now())`); err != nil {
		t.Fatalf("issue: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	fake := &fakeProvider{fail: true}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	payload, _ := json.Marshal(queue.NewsletterSendPayload{IssueID: "issue_nl_f1"})
	task := asynq.NewTask(queue.TaskNewsletterSend, payload)
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("HandleNewsletterSend: %v", err)
	}

	var status string
	var failed int
	if err := poolTest.QueryRow(ctx,
		`SELECT status, "failedCount" FROM "NewsletterIssue" WHERE id = 'issue_nl_f1'`,
	).Scan(&status, &failed); err != nil {
		t.Fatalf("issue state: %v", err)
	}
	if status != "FAILED" || failed != 1 {
		t.Fatalf("issue = %s failed=%d, attendu FAILED 1", status, failed)
	}

	var deliveryStatus, deliveryErr string
	if err := poolTest.QueryRow(ctx,
		`SELECT status, COALESCE(error, '') FROM "NewsletterDelivery" WHERE "issueId" = 'issue_nl_f1'`,
	).Scan(&deliveryStatus, &deliveryErr); err != nil {
		t.Fatalf("delivery: %v", err)
	}
	if deliveryStatus != "FAILED" || !strings.Contains(deliveryErr, "smtp down") {
		t.Fatalf("delivery = %s err=%q, attendu FAILED avec « smtp down »", deliveryStatus, deliveryErr)
	}

	// Retry : l'issue est FAILED (≠ SENDING) → no-op, aucun nouvel envoi.
	fake.fail = false
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("HandleNewsletterSend retry: %v", err)
	}
	if len(fake.sent) != 0 {
		t.Fatalf("retry a envoyé %d emails, attendu 0 (issue déjà traitée)", len(fake.sent))
	}
}
