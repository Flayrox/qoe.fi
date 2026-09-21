package workers

// =====================================================================
// 👋 Tests de l'email de bienvenue (welcome_email.go)
// =====================================================================
// Contrats : envoyé UNIQUEMENT à un abonné confirmé, dans SA langue
// (Subscriber.locale), avec la personnalisation du créateur (corps,
// sujet), coupable via welcomeEnabled=false, et silencieux sans
// fournisseur email.

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/hibiken/asynq"

	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/testutil"
)

// seedWelcomeFixture crée une publication + un abonné CONFIRMÉ (éventuellement
// avec réglages email et locale).
func seedWelcomeFixture(t *testing.T, ctx context.Context, email, locale, emailSettings string) (string, string) {
	requirePool(t)
	t.Helper()
	pool := testutil.MustPool(t)

	if _, err := pool.Exec(ctx, `
		INSERT INTO "Publication" (id, name, slug, "emailSettings", "updatedAt")
		VALUES ('pub_welcome', 'La Gazette Welcome', 'gazette-welcome', COALESCE(NULLIF($1, '')::jsonb, '{}'::jsonb), now())
		ON CONFLICT (id) DO UPDATE SET "emailSettings" = EXCLUDED."emailSettings"`, emailSettings); err != nil {
		t.Fatalf("seed publication: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM "Subscriber" WHERE "publicationId" = 'pub_welcome'`); err != nil {
		t.Fatalf("cleanup subscribers: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", locale, "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		VALUES ('sub_welcome_1', $1, 'pub_welcome', $2, true, true, now(), now(), now())`, email, locale); err != nil {
		t.Fatalf("seed subscriber: %v", err)
	}
	return "pub_welcome", email
}

func runWelcome(t *testing.T, ctx context.Context, fake *fakeProvider, email, pubID string) {
	t.Helper()
	w := NewWelcomeEmailWorker(testutil.MustPool(t))
	w.SetEmailProvider(fake, "noreply@qoe.fi")
	payload, _ := json.Marshal(queue.SubscriberWelcomePayload{Email: email, PublicationID: pubID})
	if err := w.HandleSubscriberWelcome(ctx, asynq.NewTask(queue.TaskSubscriberWelcome, payload)); err != nil {
		t.Fatalf("HandleSubscriberWelcome: %v", err)
	}
}

func TestWelcomeEmailWorker_SendsLocalizedFrench(t *testing.T) {
	ctx := context.Background()
	pubID, email := seedWelcomeFixture(t, ctx, "marie@test.dev", "fr", "")

	fake := &fakeProvider{}
	runWelcome(t, ctx, fake, email, pubID)

	if len(fake.sent) != 1 {
		t.Fatalf("emails envoyés = %d, attendu 1", len(fake.sent))
	}
	msg := fake.sent[0]
	if !strings.Contains(msg.Subject, "Bienvenue chez La Gazette Welcome") {
		t.Errorf("sujet fr = %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "lang=\"fr\"") {
		t.Error("l'email doit porter lang=fr")
	}
	if !strings.Contains(msg.HTML, "est confirmée") {
		t.Errorf("corps par défaut fr absent : %.200s", msg.HTML)
	}
	// Multipart : alternative texte + expéditeur brandé + List-Id.
	if strings.TrimSpace(msg.Text) == "" {
		t.Error("alternative texte absente")
	}
	if !strings.HasPrefix(msg.From, "La Gazette Welcome <") {
		t.Errorf("From = %q (nom de publication attendu)", msg.From)
	}
	if msg.ListID != "la-gazette-welcome.qoe.fi" {
		t.Errorf("List-Id = %q", msg.ListID)
	}
	if msg.RefID == "" {
		t.Error("X-Entity-Ref-ID absent (anti-threading)")
	}
}

func TestWelcomeEmailWorker_EnglishSubscriberGetsEnglish(t *testing.T) {
	ctx := context.Background()
	pubID, email := seedWelcomeFixture(t, ctx, "jack@test.dev", "en", "")

	fake := &fakeProvider{}
	runWelcome(t, ctx, fake, email, pubID)

	if len(fake.sent) != 1 {
		t.Fatalf("emails envoyés = %d, attendu 1", len(fake.sent))
	}
	msg := fake.sent[0]
	if !strings.Contains(msg.Subject, "Welcome to La Gazette Welcome") {
		t.Errorf("sujet en = %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "lang=\"en\"") {
		t.Error("l'email doit porter lang=en")
	}
	if strings.Contains(msg.HTML, "Bienvenue") {
		t.Error("un abonné en ne doit pas recevoir le texte français")
	}
}

func TestWelcomeEmailWorker_CreatorCustomizationWins(t *testing.T) {
	ctx := context.Background()
	settings := `{
		"subjects": {"welcome": "Ravi de vous rejoindre !"},
		"welcomeBodyFr": "Corps personnalisé du créateur.",
		"accentColor": "#7c3aed",
		"fromName": "Léa"
	}`
	pubID, email := seedWelcomeFixture(t, ctx, "custom@test.dev", "fr", settings)

	fake := &fakeProvider{}
	runWelcome(t, ctx, fake, email, pubID)

	msg := fake.sent[0]
	if msg.Subject != "Ravi de vous rejoindre !" {
		t.Errorf("sujet personnalisé attendu, got %q", msg.Subject)
	}
	if !strings.Contains(msg.HTML, "Corps personnalisé du créateur.") {
		t.Error("corps personnalisé absent du HTML")
	}
	if !strings.Contains(msg.HTML, "background:#7c3aed") {
		t.Error("couleur d'accent personnalisée absente du bouton")
	}
	if !strings.HasPrefix(msg.From, "Léa <") {
		t.Errorf("From personnalisé attendu, got %q", msg.From)
	}
}

func TestWelcomeEmailWorker_DisabledByCreator(t *testing.T) {
	ctx := context.Background()
	pubID, email := seedWelcomeFixture(t, ctx, "off@test.dev", "fr", `{"welcomeEnabled": false}`)

	fake := &fakeProvider{}
	runWelcome(t, ctx, fake, email, pubID)

	if len(fake.sent) != 0 {
		t.Fatalf("bienvenue désactivé : %d emails envoyés, attendu 0", len(fake.sent))
	}
}

func TestWelcomeEmailWorker_UnconfirmedOrMissing_IsSilent(t *testing.T) {
	ctx := context.Background()
	pool := testutil.MustPool(t)
	pubID, email := seedWelcomeFixture(t, ctx, "ghost@test.dev", "fr", "")

	// Abonné repassé non confirmé (confirmedAt NULL).
	if _, err := pool.Exec(ctx, `UPDATE "Subscriber" SET "confirmedAt" = NULL WHERE email = $1 AND "publicationId" = 'pub_welcome'`, email); err != nil {
		t.Fatalf("unconfirm: %v", err)
	}
	fake := &fakeProvider{}
	runWelcome(t, ctx, fake, email, pubID)
	if len(fake.sent) != 0 {
		t.Fatalf("abonné non confirmé : %d emails envoyés, attendu 0", len(fake.sent))
	}

	// Abonné absent (autre email) : pas d'erreur, pas d'envoi.
	fake2 := &fakeProvider{}
	runWelcome(t, ctx, fake2, "absent@test.dev", pubID)
	if len(fake2.sent) != 0 {
		t.Fatalf("abonné absent : %d emails envoyés, attendu 0", len(fake2.sent))
	}
}

func TestWelcomeEmailWorker_NoProvider_IsNoOp(t *testing.T) {
	ctx := context.Background()
	pubID, email := seedWelcomeFixture(t, ctx, "noprovider@test.dev", "fr", "")

	w := NewWelcomeEmailWorker(testutil.MustPool(t))
	payload, _ := json.Marshal(queue.SubscriberWelcomePayload{Email: email, PublicationID: pubID})
	if err := w.HandleSubscriberWelcome(ctx, asynq.NewTask(queue.TaskSubscriberWelcome, payload)); err != nil {
		t.Fatalf("sans provider, la tâche doit être un no-op: %v", err)
	}
}
