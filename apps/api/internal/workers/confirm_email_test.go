package workers

// =====================================================================
// ✅ Tests du double opt-in — worker, signature HMAC et garde-fous SQL
// =====================================================================
// Trois couches vérifiées (base de test PostgreSQL éphémère, migrations
// appliquées) :
//  1. le worker envoie l'email de confirmation avec le lien signé, et ignore
//     silencieusement les tâches d'abonnés déjà confirmés (idempotence) ;
//  2. la signature du lien est infalsifiable (miroir de l'unsubscribe HMAC) ;
//  3. les requêtes de fanout bulk (newsletter + release) n'adressent JAMAIS
//     un abonné non confirmé — c'est la promesse consentement du double opt-in.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/hibiken/asynq"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/testutil"
)

// seedConfirmFixture crée une publication + un abonné PENDING (receiveArticles
// false, token posé) et renvoie (pubID, email, token).
func seedConfirmFixture(t *testing.T, ctx context.Context) (string, string, string) {
	requirePool(t)
	t.Helper()
	pool := testutil.MustPool(t)

	if _, err := pool.Exec(ctx, `
		INSERT INTO "Publication" (id, name, slug, "updatedAt")
		VALUES ('pub_confirm', 'La Gazette Confirm', 'gazette-confirm', now())
		ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("seed publication: %v", err)
	}
	// Nettoyage des abonnés de la fixture (relance entre tests du package).
	if _, err := pool.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_confirm'`); err != nil {
		t.Fatalf("cleanup subscribers: %v", err)
	}

	token := "tok-e2e-confirmation-1234"
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmationToken", "createdAt", "updatedAt")
		VALUES ('sub_confirm_1', 'pending@test.dev', 'pub_confirm', true, false, $1, now(), now())`, token); err != nil {
		t.Fatalf("seed subscriber: %v", err)
	}
	return "pub_confirm", "pending@test.dev", token
}

func TestConfirmEmailWorker_SendsSignedLink(t *testing.T) {
	ctx := context.Background()
	pubID, email, _ := seedConfirmFixture(t, ctx)

	fake := &fakeProvider{}
	w := NewConfirmEmailWorker(testutil.MustPool(t))
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	payload, err := json.Marshal(queue.SubscriberConfirmPayload{Email: email, PublicationID: pubID})
	if err != nil {
		t.Fatalf("payload: %v", err)
	}
	if err := w.HandleSubscriberConfirm(ctx, asynq.NewTask(queue.TaskSubscriberConfirm, payload)); err != nil {
		t.Fatalf("HandleSubscriberConfirm: %v", err)
	}

	if len(fake.sent) != 1 {
		t.Fatalf("emails envoyés = %d, attendu 1", len(fake.sent))
	}
	msg := fake.sent[0]
	if msg.To != email {
		t.Fatalf("destinataire = %q, attendu %q", msg.To, email)
	}
	if !strings.Contains(msg.HTML, "/v1/newsletters/confirm?") {
		t.Fatalf("le lien de confirmation est absent du corps : %.120s", msg.HTML)
	}
	idx := strings.Index(msg.HTML, "sig=")
	sig := msg.HTML[idx+4:]
	if len(sig) > 64 {
		sig = sig[:64]
	}
	if !VerifyConfirm(pubID, email, sig) {
		t.Fatalf("signature du lien invalide : %s", sig)
	}
}

func TestConfirmEmailWorker_AlreadyConfirmed_IsSilent(t *testing.T) {
	ctx := context.Background()
	pool := testutil.MustPool(t)
	pubID, email, _ := seedConfirmFixture(t, ctx)

	// Abonné déjà confirmé (token effacé) → la tâche doit être un no-op.
	if _, err := pool.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = $1`, pubID); err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		VALUES ('sub_confirm_2', $1, $2, true, true, now(), now(), now())`, email, pubID); err != nil {
		t.Fatalf("seed confirmed: %v", err)
	}

	fake := &fakeProvider{}
	w := NewConfirmEmailWorker(pool)
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	payload, _ := json.Marshal(queue.SubscriberConfirmPayload{Email: email, PublicationID: pubID})
	if err := w.HandleSubscriberConfirm(ctx, asynq.NewTask(queue.TaskSubscriberConfirm, payload)); err != nil {
		t.Fatalf("HandleSubscriberConfirm (déjà confirmé) doit être silencieux: %v", err)
	}
	if len(fake.sent) != 0 {
		t.Fatalf("emails envoyés = %d, attendu 0 (pas de re-spam à la re-inscription)", len(fake.sent))
	}
}

func TestConfirmEmailWorker_NoProvider_IsNoOp(t *testing.T) {
	ctx := context.Background()
	pubID, email, _ := seedConfirmFixture(t, ctx)

	w := NewConfirmEmailWorker(testutil.MustPool(t))
	// SetEmailProvider jamais appelé → provider nil.
	payload, _ := json.Marshal(queue.SubscriberConfirmPayload{Email: email, PublicationID: pubID})
	if err := w.HandleSubscriberConfirm(ctx, asynq.NewTask(queue.TaskSubscriberConfirm, payload)); err != nil {
		t.Fatalf("sans provider, la tâche doit être un no-op: %v", err)
	}
}

func TestVerifyConfirm_TamperedSignatureRejected(t *testing.T) {
	pubID, email := "pub_x", "a@b.c"
	sig := SignConfirm(pubID, email)
	if !VerifyConfirm(pubID, email, sig) {
		t.Fatal("signature légitime rejetée")
	}
	if VerifyConfirm("pub_other", email, sig) || VerifyConfirm(pubID, "other@b.c", sig) {
		t.Fatal("signature acceptée pour un autre couple pub/email")
	}
	if VerifyConfirm(pubID, email, "deadbeef"+sig[8:]) {
		t.Fatal("signature falsifiée acceptée")
	}
}

// TestBulkFanout_NeverMailsUnconfirmedSubscribers est le cœur du contrat
// consentement : ni l'abonné PENDING (receiveArticles=false), ni l'abonné
// « hérité » actif receiveArticles=true mais jamais confirmé ne doivent
// recevoir de bulk — tandis qu'un abonné confirmé reste bien ciblé (contrôle
// positif : le filtre n'exclut pas tout le monde).
func TestBulkFanout_NeverMailsUnconfirmedSubscribers(t *testing.T) {
	ctx := context.Background()
	pool := testutil.MustPool(t)
	_, _, _ = seedConfirmFixture(t, ctx)

	// 1) abonné « hérité » : actif + receiveArticles=true, jamais confirmé.
	// 2) contrôle positif : abonné confirmé receiveArticles=true.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmationToken", "confirmedAt", "createdAt", "updatedAt")
		VALUES
		  ('sub_confirm_legacy', 'legacy@test.dev', 'pub_confirm', true, true, NULL, NULL, now(), now()),
		  ('sub_confirm_ok',     'confirmed@test.dev', 'pub_confirm', true, true, NULL, now(), now(), now())`); err != nil {
		t.Fatalf("seed legacy+control: %v", err)
	}

	q := db.New(pool)

	// Fanout d'une newsletter créateur.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "NewsletterIssue" (id, "publicationId", subject, html, status, "updatedAt")
		VALUES ('issue_confirm_t', 'pub_confirm', 'Test', '<p>x</p>', 'SENDING', now())
		ON CONFLICT (id) DO NOTHING`); err != nil {
		t.Fatalf("seed issue: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM "NewsletterDelivery" WHERE "issueId" = 'issue_confirm_t'`)
		_, _ = pool.Exec(ctx, `DELETE FROM "NewsletterIssue" WHERE id = 'issue_confirm_t'`)
		_, _ = pool.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_confirm'`)
	})
	if err := q.InsertNewsletterDeliveries(ctx, db.InsertNewsletterDeliveriesParams{
		IssueId: "issue_confirm_t", PublicationId: "pub_confirm",
	}); err != nil {
		t.Fatalf("InsertNewsletterDeliveries: %v", err)
	}
	var dbg int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM "NewsletterDelivery" WHERE "issueId" = 'issue_confirm_t'`).Scan(&dbg)
	rows, err := q.ListNewsletterDeliveriesByIssue(ctx, db.ListNewsletterDeliveriesByIssueParams{IssueId: "issue_confirm_t", Limit: 100})
	if err != nil {
		t.Fatalf("ListNewsletterDeliveriesByIssue: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("aucune livraison : le contrôle positif (abonné confirmé) aurait dû être ciblé")
	}
	gotConfirmed := false
	for _, r := range rows {
		if r.Email == "pending@test.dev" || r.Email == "legacy@test.dev" {
			t.Fatalf("fuite consentement : l'abonné non confirmé %q est dans le fanout bulk", r.Email)
		}
		if r.Email == "confirmed@test.dev" {
			gotConfirmed = true
		}
	}

	// Une adresse confirmée mais en opposition (globale ou pour cette
	// publication) ne doit jamais être matérialisée — même si sa ligne
	// Subscriber est restée active (course désinscription/envoi).
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		VALUES
		  ('sub_confirm_sup_g', 'suppressed-global@test.dev', 'pub_confirm', true, true, now(), now(), now()),
		  ('sub_confirm_sup_p', 'suppressed-pub@test.dev', 'pub_confirm', true, true, now(), now(), now())
		ON CONFLICT ("email", "publicationId") DO UPDATE SET
		  "isActive" = true, "receiveArticles" = true, "confirmedAt" = COALESCE("Subscriber"."confirmedAt", now())`); err != nil {
		t.Fatalf("seed opposés: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "EmailSuppression" ("id", "email", "scope", "publicationId", "reason")
		VALUES
		  (gen_random_uuid()::text, 'suppressed-global@test.dev', 'global', NULL, 'complaint'),
		  (gen_random_uuid()::text, 'suppressed-pub@test.dev', 'publication', 'pub_confirm', 'unsubscribe')
		ON CONFLICT DO NOTHING`); err != nil {
		t.Fatalf("seed suppressions: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM "EmailSuppression" WHERE email IN ('suppressed-global@test.dev', 'suppressed-pub@test.dev')`)
		_, _ = pool.Exec(ctx, `DELETE FROM "Subscriber" WHERE email IN ('suppressed-global@test.dev', 'suppressed-pub@test.dev') AND "publicationId" = 'pub_confirm'`)
	})
	if err := q.InsertNewsletterDeliveries(ctx, db.InsertNewsletterDeliveriesParams{
		IssueId: "issue_confirm_t", PublicationId: "pub_confirm",
	}); err != nil {
		t.Fatalf("InsertNewsletterDeliveries (2e passe): %v", err)
	}
	rowsSuppr, err := q.ListNewsletterDeliveriesByIssue(ctx, db.ListNewsletterDeliveriesByIssueParams{IssueId: "issue_confirm_t", Limit: 100})
	if err != nil {
		t.Fatalf("ListNewsletterDeliveriesByIssue (2e passe): %v", err)
	}
	for _, r := range rowsSuppr {
		if r.Email == "suppressed-global@test.dev" || r.Email == "suppressed-pub@test.dev" {
			t.Fatalf("fuite opposition : %q est dans le fanout bulk malgré sa suppression", r.Email)
		}
	}
	if !gotConfirmed {
		t.Fatal("l'abonné confirmé (contrôle positif) est absent du fanout")
	}

	// Fanout d'une release d'article.
	if err := q.InsertArticleReleaseDeliveries(ctx, db.InsertArticleReleaseDeliveriesParams{
		ArticleId: "art_confirm_t", PublicationId: "pub_confirm",
	}); err != nil {
		t.Fatalf("InsertArticleReleaseDeliveries: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM "ArticleReleaseDelivery" WHERE "articleId" = 'art_confirm_t'`)
	})
	rows2, err := q.ListQueuedArticleReleaseDeliveries(ctx, db.ListQueuedArticleReleaseDeliveriesParams{
		ArticleId: "art_confirm_t", Limit: 100,
	})
	if err != nil {
		t.Fatalf("ListQueuedArticleReleaseDeliveries: %v", err)
	}
	for _, r := range rows2 {
		if r.Email == "pending@test.dev" || r.Email == "legacy@test.dev" {
			t.Fatalf("fuite consentement : l'abonné non confirmé %q est dans le fanout release", r.Email)
		}
	}
}

// TestConfirmEmailWorker_KillSwitchStopsSend — l'arrêt d'urgence global coupe
// l'envoi mais ne détruit pas la demande : le token reste en base, le
// destinataire peut redemander un lien (qui invalidera celui-ci). La tâche
// est consommée sans erreur (pas de retry qui spammerait au redémarrage).
func TestConfirmEmailWorker_KillSwitchStopsSend(t *testing.T) {
	ctx := context.Background()
	pubID, email, _ := seedConfirmFixture(t, ctx)
	const token = "tok-kill-switch"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "receiveArticles", "confirmationToken", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, true, false, $3, now(), now())
		 ON CONFLICT ("email", "publicationId") DO UPDATE SET "confirmationToken" = EXCLUDED."confirmationToken"`,
		email, pubID, token); err != nil {
		t.Fatalf("seed pending: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO feature_flags (key, is_enabled, description, target_roles)
		 VALUES ('workers-email-kill', true, 'test', '{all}')
		 ON CONFLICT (key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`); err != nil {
		t.Fatalf("set kill: %v", err)
	}
	defer poolTest.Exec(ctx, `DELETE FROM feature_flags WHERE key = 'workers-email-kill'`)

	fake := &fakeProvider{}
	w := NewConfirmEmailWorker(poolTest)
	w.SetEmailProvider(fake, "noreply@qoe.fi")

	payload, err := json.Marshal(queue.SubscriberConfirmPayload{Email: email, PublicationID: pubID})
	if err != nil {
		t.Fatalf("payload: %v", err)
	}
	if err := w.HandleSubscriberConfirm(ctx, asynq.NewTask(queue.TaskSubscriberConfirm, payload)); err != nil {
		t.Fatalf("HandleSubscriberConfirm (kill): %v", err)
	}
	if len(fake.sent) != 0 {
		t.Fatalf("arrêt d'urgence a envoyé %d emails, attendu 0", len(fake.sent))
	}
	// Demande intacte : token toujours présent, toujours en attente.
	var tok *string
	var receive bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "confirmationToken", "receiveArticles" FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&tok, &receive); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if tok == nil || *tok != token || receive {
		t.Fatal("la demande aurait dû survivre intacte à l'arrêt d'urgence")
	}
}
