package workers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/flags"
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

// TestNewsletterSend_KillSwitch — le flag workers-newsletter-dispatch (console
// admin / feature_flags) coupe l'envoi : aucune livraison matérialisée, aucun
// email, l'issue repasse en DRAFT (pas d'état bloqué — les livraisons déjà
// SENT restent marquées, seule la reprise des QUEUED est possible au ré-envoi).
func TestNewsletterSend_KillSwitch(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{`"NewsletterDelivery"`, `"NewsletterIssue"`, `"Subscriber"`, `"Publication"`} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM feature_flags WHERE key = 'workers-newsletter-dispatch'`); err != nil {
		t.Fatalf("clear flag: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, "updatedAt") VALUES ('pub_nl_kill', 'Kill Pub', 'kill-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "updatedAt", "publicationId")
		 VALUES ('sub_nl_k1', 'kill@test.dev', now(), 'pub_nl_kill')`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NewsletterIssue" (id, "publicationId", subject, html, status, "updatedAt")
		 VALUES ('issue_nl_k1', 'pub_nl_kill', 'Kill', '<p>x</p>', 'SENDING', now())`); err != nil {
		t.Fatalf("issue: %v", err)
	}
	// Flag OFF dans la table partagée (comme le ferait la console admin).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		 VALUES ('workers-newsletter-dispatch', false, 'test', '{all}')
		 ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`); err != nil {
		t.Fatalf("set flag off: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	w.SetFlags(flags.NewService(poolTest))
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, err := queue.NewNewsletterSendTask(queue.NewsletterSendPayload{IssueID: "issue_nl_k1"})
	if err != nil {
		t.Fatalf("task: %v", err)
	}
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("HandleNewsletterSend (kill switch): %v", err)
	}

	if len(fake.sent) != 0 {
		t.Fatalf("kill switch a envoyé %d emails, attendu 0", len(fake.sent))
	}
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "NewsletterDelivery" WHERE "issueId" = 'issue_nl_k1'`,
	).Scan(&n); err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if n != 0 {
		t.Fatalf("kill switch a matérialisé %d livraisons, attendu 0", n)
	}
	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT status FROM "NewsletterIssue" WHERE id = 'issue_nl_k1'`,
	).Scan(&status); err != nil {
		t.Fatalf("issue state: %v", err)
	}
	if status != "DRAFT" {
		t.Fatalf("issue = %s, attendu DRAFT (envoi coupé, retour brouillon — pas d'état bloqué)", status)
	}
}

// TestNewsletterSend_Batches — le pipeline envoie par lots rate-limités : à
// chaque appel, au plus `batchSize` emails sont envoyés et l'issue reste
// SENDING tant qu'il reste des livraisons QUEUED ; le dernier lot clôt l'issue
// avec les compteurs exacts. (Sans client asynq branché, la re-enqueue du lot
// suivant est simulée par des appels successifs au handler.)
func TestNewsletterSend_Batches(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{`"NewsletterDelivery"`, `"NewsletterIssue"`, `"Subscriber"`, `"Publication"`} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, "updatedAt") VALUES ('pub_nl_batch', 'Batch Pub', 'batch-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	// 65 abonnés opt-in : 2 lots pleins (30) + 1 lot partiel (5).
	for i := 0; i < 65; i++ {
		email := fmt.Sprintf("sub%02d@test.dev", i)
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "Subscriber" (id, email, "updatedAt", "publicationId")
			 VALUES (gen_random_uuid()::text, $1, now(), 'pub_nl_batch')`, email); err != nil {
			t.Fatalf("subscriber %s: %v", email, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NewsletterIssue" (id, "publicationId", subject, html, status, "updatedAt")
		 VALUES ('issue_nl_b1', 'pub_nl_batch', 'Batch', '<p>x</p>', 'SENDING', now())`); err != nil {
		t.Fatalf("issue: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	w.SetRatePerMinute(30) // batchSize = 30
	w.SetPacer(func() {})  // pas d'attente réelle entre les envois
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, _ := queue.NewNewsletterSendTask(queue.NewsletterSendPayload{IssueID: "issue_nl_b1"})

	// Lot 1 : 30 envoyés, 35 QUEUED restants, issue toujours SENDING.
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("lot 1: %v", err)
	}
	if len(fake.sent) != 30 {
		t.Fatalf("lot 1 = %d envois, attendu 30", len(fake.sent))
	}
	var status string
	var queued int
	_ = poolTest.QueryRow(ctx, `SELECT status FROM "NewsletterIssue" WHERE id = 'issue_nl_b1'`).Scan(&status)
	_ = poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "NewsletterDelivery" WHERE "issueId" = 'issue_nl_b1' AND status = 'QUEUED'`).Scan(&queued)
	if status != "SENDING" || queued != 35 {
		t.Fatalf("lot 1 : status=%s queued=%d, attendu SENDING/35", status, queued)
	}

	// Lot 2 : 30 de plus.
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("lot 2: %v", err)
	}
	if len(fake.sent) != 60 {
		t.Fatalf("lot 2 = %d envois cumulés, attendu 60", len(fake.sent))
	}

	// Lot 3 (partiel) : 5 envoyés, issue clôturée SENT avec les compteurs.
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("lot 3: %v", err)
	}
	if len(fake.sent) != 65 {
		t.Fatalf("lot 3 = %d envois cumulés, attendu 65", len(fake.sent))
	}
	var sent, failed, total int
	_ = poolTest.QueryRow(ctx,
		`SELECT status, "sentCount", "failedCount", "totalRecipients" FROM "NewsletterIssue" WHERE id = 'issue_nl_b1'`,
	).Scan(&status, &sent, &failed, &total)
	if status != "SENT" || sent != 65 || failed != 0 || total != 65 {
		t.Fatalf("issue = %s sent=%d failed=%d total=%d, attendu SENT 65/0/65", status, sent, failed, total)
	}

	// Un 4e appel ne renvoie rien (issue ≠ SENDING).
	if err := w.HandleNewsletterSend(ctx, task); err != nil {
		t.Fatalf("lot 4: %v", err)
	}
	if len(fake.sent) != 65 {
		t.Fatalf("lot 4 a renvoyé %d emails, attendu 0 (issue clôturée)", len(fake.sent))
	}
}

// TestArticleRelease_Fanout — la synchro release d'article matérialise les
// livraisons (abonnés actifs + receiveArticles), envoie l'email avec titre /
// extrait / lien public, et la dédup article/email évite tout double envoi
// (republish).
func TestArticleRelease_Fanout(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{
		`"ArticleReleaseDelivery"`, `"Subscriber"`, `"Publication"`, `"Article"`,
	} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, subdomain, "updatedAt")
		 VALUES ('pub_rel_1', 'Release Pub', 'release-pub', 'release-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000001', 'author.rel@test.dev', 'authorrel', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "receiveArticles", "updatedAt", "publicationId")
		 VALUES ('sub_rel_1', 'reader@test.dev', true, now(), 'pub_rel_1'),
		        ('sub_rel_2', 'muted@test.dev', false, now(), 'pub_rel_1')`); err != nil {
		t.Fatalf("subscribers: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_rel_1', 'Grand reportage', 'grand-reportage', '<p>Un long contenu public.</p>', true, 'PUBLISHED',
		         'pub_rel_1', '00000000-0000-0000-0000-000000000001', now(), now())`); err != nil {
		t.Fatalf("article: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	w.SetPacer(func() {})
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, _ := queue.NewArticleReleaseTask(queue.ArticleReleasePayload{ArticleID: "art_rel_1"})
	if err := w.HandleArticleRelease(ctx, task); err != nil {
		t.Fatalf("HandleArticleRelease: %v", err)
	}

	if len(fake.sent) != 1 {
		t.Fatalf("sent = %d, attendu 1 (seul l'abonné opt-in)", len(fake.sent))
	}
	if fake.sent[0].To != "reader@test.dev" {
		t.Fatalf("destinataire = %s", fake.sent[0].To)
	}
	if !strings.Contains(fake.sent[0].Subject, "Grand reportage") {
		t.Fatalf("sujet = %q, attendu titre de l'article", fake.sent[0].Subject)
	}
	if !strings.Contains(fake.sent[0].HTML, "Un long contenu public.") {
		t.Fatal("extrait de l'article absent de l'email")
	}
	if !strings.Contains(fake.sent[0].HTML, "https://release-pub.qoe.fi/grand-reportage") {
		t.Fatalf("lien public absent : %q", fake.sent[0].HTML)
	}
	if !strings.Contains(fake.sent[0].HTML, "Se désabonner") {
		t.Fatal("lien de désabonnement absent")
	}

	// Re-publish (même article) : la dédup article/email bloque le 2e envoi.
	if err := w.HandleArticleRelease(ctx, task); err != nil {
		t.Fatalf("HandleArticleRelease (republish): %v", err)
	}
	if len(fake.sent) != 1 {
		t.Fatalf("republish a envoyé %d emails, attendu 0 (dédup article/email)", len(fake.sent)-1)
	}
}

// TestArticleRelease_Premium — un article premium n'embarque jamais de contenu
// (pas de fuite de paywall par email) : teaser + CTA seulement.
func TestArticleRelease_Premium(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{
		`"ArticleReleaseDelivery"`, `"Subscriber"`, `"Publication"`, `"Article"`,
	} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, subdomain, "updatedAt")
		 VALUES ('pub_rel_p', 'Premium Pub', 'premium-pub', 'premium-pub', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000001', 'author.prem@test.dev', 'authorprem', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "updatedAt", "publicationId")
		 VALUES ('sub_rel_p', 'prem@test.dev', now(), 'pub_rel_p')`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, "isPremium", published, status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_rel_p', 'Paywall secret', 'paywall-secret', '<p>CONTENU PAYANT CONFIDENTIEL</p>', true, true, 'PUBLISHED',
		         'pub_rel_p', '00000000-0000-0000-0000-000000000001', now(), now())`); err != nil {
		t.Fatalf("article: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	w.SetPacer(func() {})
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, _ := queue.NewArticleReleaseTask(queue.ArticleReleasePayload{ArticleID: "art_rel_p"})
	if err := w.HandleArticleRelease(ctx, task); err != nil {
		t.Fatalf("HandleArticleRelease: %v", err)
	}
	if len(fake.sent) != 1 {
		t.Fatalf("sent = %d, attendu 1", len(fake.sent))
	}
	if strings.Contains(fake.sent[0].HTML, "CONTENU PAYANT CONFIDENTIEL") {
		t.Fatal("fuite de contenu premium dans l'email")
	}
	if !strings.Contains(fake.sent[0].HTML, "réservé aux abonnés") || !strings.Contains(fake.sent[0].HTML, "Lire l'article") {
		t.Fatal("teaser premium ou CTA absent")
	}
}

// TestArticleRelease_KillSwitch — flag off : aucune livraison matérialisée,
// aucun email.
func TestArticleRelease_KillSwitch(t *testing.T) {
	ctx := context.Background()
	for _, table := range []string{
		`"ArticleReleaseDelivery"`, `"Subscriber"`, `"Publication"`, `"Article"`,
	} {
		if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE `+table+` CASCADE`); err != nil {
			t.Fatalf("truncate %s: %v", table, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		 VALUES ('workers-newsletter-dispatch', false, 'test', '{all}')
		 ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`); err != nil {
		t.Fatalf("set flag off: %v", err)
	}
	defer poolTest.Exec(ctx, `DELETE FROM feature_flags WHERE key = 'workers-newsletter-dispatch'`)
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, name, slug, "updatedAt")
		 VALUES ('pub_rel_k', 'Kill Rel', 'kill-rel', now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, "createdAt", "updatedAt")
		 VALUES ('00000000-0000-0000-0000-000000000001', 'author.kill@test.dev', 'authorkill', now(), now())`); err != nil {
		t.Fatalf("user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "updatedAt", "publicationId")
		 VALUES ('sub_rel_k', 'killrel@test.dev', now(), 'pub_rel_k')`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_rel_k', 'Kill', 'kill', '<p>x</p>', true, 'PUBLISHED',
		         'pub_rel_k', '00000000-0000-0000-0000-000000000001', now(), now())`); err != nil {
		t.Fatalf("article: %v", err)
	}

	w := NewNewsletterWorker(poolTest)
	w.SetFlags(flags.NewService(poolTest))
	fake := &fakeProvider{}
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	task, _ := queue.NewArticleReleaseTask(queue.ArticleReleasePayload{ArticleID: "art_rel_k"})
	if err := w.HandleArticleRelease(ctx, task); err != nil {
		t.Fatalf("HandleArticleRelease (kill switch): %v", err)
	}
	if len(fake.sent) != 0 {
		t.Fatalf("kill switch a envoyé %d emails, attendu 0", len(fake.sent))
	}
	var n int
	_ = poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "ArticleReleaseDelivery" WHERE "articleId" = 'art_rel_k'`).Scan(&n)
	if n != 0 {
		t.Fatalf("kill switch a matérialisé %d livraisons, attendu 0", n)
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
