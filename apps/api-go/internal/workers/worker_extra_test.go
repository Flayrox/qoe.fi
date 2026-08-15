package workers

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/meilisearch/meilisearch-go"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/testutil"
)

// ─── Newsletter worker ────────────────────────────────────────────────

func seedNewsletter(t *testing.T) string {
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// 2 abonnés actifs + 1 inactif (pas compté).
	subs := []struct {
		email   string
		active  bool
		premium bool
	}{
		{"a@test.dev", true, false},
		{"b@test.dev", true, true},
		{"c@test.dev", false, false},
	}
	for _, s := range subs {
		if _, err := poolTest.Exec(context.Background(),
			`INSERT INTO "Subscriber" (id, email, "publicationId", status, "isActive", "isPremium", "updatedAt")
			 VALUES (gen_random_uuid()::text, $1, $2, 'ACTIVE', $3, $4, now())`,
			s.email, fx.PublicationID, s.active, s.premium,
		); err != nil {
			t.Fatalf("subscriber %s: %v", s.email, err)
		}
	}
	return fx.PublicationID
}

func TestNewsletter_HandleArticlePublished_ProcessesActiveSubscribers(t *testing.T) {
	pubID := seedNewsletter(t)
	worker := NewNewsletterWorker(poolTest)

	payload, _ := json.Marshal(map[string]any{
		"publicationId": pubID,
		"articleId":     "art_news",
		"authorId":      "00000000-0000-0000-0000-000000000010",
		"title":         "Lettre",
		"visibility":    "PUBLIC",
	})
	if err := worker.HandleArticlePublished(context.Background(), asynq.NewTask("article.published", payload)); err != nil {
		t.Fatalf("HandleArticlePublished: %v", err)
	}
}

func TestNewsletter_HandleArticlePublished_NoSubscribers(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	worker := NewNewsletterWorker(poolTest)

	payload, _ := json.Marshal(map[string]any{
		"publicationId": fx.PublicationID,
		"articleId":     "art_1", "title": "x",
	})
	if err := worker.HandleArticlePublished(context.Background(), asynq.NewTask("article.published", payload)); err != nil {
		t.Fatalf("HandleArticlePublished: %v", err)
	}
}

func TestNewsletter_HandleArticlePublished_InvalidPayload(t *testing.T) {
	worker := NewNewsletterWorker(poolTest)
	if err := worker.HandleArticlePublished(context.Background(), asynq.NewTask("article.published", []byte("{bad"))); err == nil {
		t.Fatal("payload invalide = nil, attendu erreur")
	}
}

func TestNewsletter_HandlePostLiked_NoOp(t *testing.T) {
	worker := NewNewsletterWorker(poolTest)
	payload, _ := json.Marshal(map[string]any{"postId": "p1"})
	if err := worker.HandlePostLiked(context.Background(), asynq.NewTask("post.liked", payload)); err != nil {
		t.Fatalf("HandlePostLiked: %v", err)
	}
}

func TestNewsletter_StripHTML(t *testing.T) {
	if got := stripHTML("<p>Bonjour <b>monde</b></p>"); got != "Bonjour monde" {
		t.Fatalf("stripHTML = %q", got)
	}
}

// ─── Stripe worker ────────────────────────────────────────────────────

// seedStripe crée une publication personnelle + owner avec wallet à 0.
func seedStripe(t *testing.T) (pubID, ownerID string) {
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Le owner du seed a la publication personnelle → GetPersonalOwnerForCredit.
	return fx.PublicationID, fx.OwnerID
}

func stripeTask(t *testing.T, eventID, eventType string, data map[string]any) *asynq.Task {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{
		"eventId":   eventID,
		"eventType": eventType,
		"data":      data,
	})
	return asynq.NewTask("stripe.event", payload)
}

func TestStripe_PaymentSucceeded_CreditsOwnerWallet(t *testing.T) {
	pubID, ownerID := seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_1", "invoice.payment_succeeded", map[string]any{
		"metadata": map[string]any{
			"creatorId":       pubID,
			"subscriberEmail": "reader@test.dev",
		},
		"customer_email": "reader@test.dev",
		"amount_paid":    float64(2000), // 20,00 €
	}))
	if err != nil {
		t.Fatalf("HandleStripeEvent: %v", err)
	}

	// Owner role = creator → plan PRO → frais 5% → crédit 19,00 € (1900 cents).
	var balance int32
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, ownerID,
	).Scan(&balance); err != nil {
		t.Fatalf("wallet: %v", err)
	}
	if balance != 1900 {
		t.Fatalf("wallet = %d, attendu 1900 (2000 - 5%%)", balance)
	}

	// L'abonné est premium (isActive + isPremium + LTV).
	var isPremium bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "isPremium" FROM "Subscriber" WHERE email = 'reader@test.dev' AND "publicationId" = $1`,
		pubID,
	).Scan(&isPremium); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if !isPremium {
		t.Fatal("abonné non premium après payment_succeeded")
	}
}

func TestStripe_SubscriptionDeleted_SetsCanceled(t *testing.T) {
	pubID, _ := seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	// Abonné actif au départ.
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Subscriber" (id, email, "publicationId", status, "isActive", "isPremium", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'del@test.dev', $1, 'ACTIVE', true, true, now())`,
		pubID,
	); err != nil {
		t.Fatalf("subscriber: %v", err)
	}

	err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_2", "customer.subscription.deleted", map[string]any{
		"metadata": map[string]any{
			"creatorId":       pubID,
			"subscriberEmail": "del@test.dev",
		},
	}))
	if err != nil {
		t.Fatalf("HandleStripeEvent: %v", err)
	}

	var status string
	var active bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, "isActive" FROM "Subscriber" WHERE email = 'del@test.dev'`,
	).Scan(&status, &active); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if status != "CANCELED" || active {
		t.Fatalf("subscriber = %q/%v, attendu CANCELED/inactif", status, active)
	}
}

func TestStripe_UnknownEvent_NoOp(t *testing.T) {
	seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	if err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_3", "checkout.session.completed", nil)); err != nil {
		t.Fatalf("HandleStripeEvent: %v", err)
	}
}

func TestStripe_MissingEventID_Error(t *testing.T) {
	seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	payload, _ := json.Marshal(map[string]any{"eventType": "invoice.payment_succeeded"})
	if err := worker.HandleStripeEvent(context.Background(), asynq.NewTask("stripe.event", payload)); err == nil {
		t.Fatal("eventId manquant = nil, attendu erreur")
	}
}

func TestStripe_InvalidPayload_Error(t *testing.T) {
	worker := NewStripeWorker(poolTest, nil)
	if err := worker.HandleStripeEvent(context.Background(), asynq.NewTask("stripe.event", []byte("{"))); err == nil {
		t.Fatal("payload invalide = nil, attendu erreur")
	}
}

// ─── Search worker (Meilisearch mock) ─────────────────────────────────

// mockSyncer enregistre les opérations DeleteDocument/AddDocuments.
type mockSyncer struct {
	deleted []string
	added   []map[string]any
	err     error
}

func (m *mockSyncer) DeleteDocument(identifier string, opts *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error) {
	if m.err != nil {
		return nil, m.err
	}
	m.deleted = append(m.deleted, identifier)
	return &meilisearch.TaskInfo{}, nil
}

func (m *mockSyncer) AddDocuments(documentsPtr interface{}, opts *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error) {
	if m.err != nil {
		return nil, m.err
	}
	docs, _ := documentsPtr.([]any)
	for _, d := range docs {
		if doc, ok := d.(map[string]any); ok {
			m.added = append(m.added, doc)
		}
	}
	return &meilisearch.TaskInfo{}, nil
}

func newTestSearchWorker(t *testing.T, m *mockSyncer) *SearchWorker {
	t.Helper()
	return &SearchWorker{pool: poolTest, q: db.New(poolTest), idx: m}
}

func searchTask(t *testing.T, action, articleID string) *asynq.Task {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{"action": action, "articleId": articleID})
	return asynq.NewTask("search.sync", payload)
}

func TestSearch_HandleSync_Upsert(t *testing.T) {
	// Seed articles (auteur + publication + catégories).
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	_ = fx

	// Récupère un article publié réel (art_test_002 = article-payant).
	var articleID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Article" WHERE slug = 'recette-pates'`,
	).Scan(&articleID); err != nil {
		t.Fatalf("article: %v", err)
	}

	mock := &mockSyncer{}
	worker := newTestSearchWorker(t, mock)
	if err := worker.HandleSearchSync(context.Background(), searchTask(t, "upsert", articleID)); err != nil {
		t.Fatalf("HandleSearchSync: %v", err)
	}
	if len(mock.added) != 1 {
		t.Fatalf("added = %d, attendu 1 document", len(mock.added))
	}
	if mock.added[0]["id"] != articleID {
		t.Fatalf("doc id = %v", mock.added[0]["id"])
	}
	if mock.added[0]["published"] != true {
		t.Fatalf("doc published = %v", mock.added[0]["published"])
	}
	if len(mock.deleted) != 0 {
		t.Fatalf("deleted = %v, attendu 0", mock.deleted)
	}
}

func TestSearch_HandleSync_Delete(t *testing.T) {
	mock := &mockSyncer{}
	worker := newTestSearchWorker(t, mock)
	if err := worker.HandleSearchSync(context.Background(), searchTask(t, "delete", "art_x")); err != nil {
		t.Fatalf("HandleSearchSync(delete): %v", err)
	}
	if len(mock.deleted) != 1 || mock.deleted[0] != "art_x" {
		t.Fatalf("deleted = %v", mock.deleted)
	}
	if len(mock.added) != 0 {
		t.Fatalf("added = %v, attendu 0", mock.added)
	}
}

func TestSearch_HandleSync_UnknownArticle_Deletes(t *testing.T) {
	mock := &mockSyncer{}
	worker := newTestSearchWorker(t, mock)
	if err := worker.HandleSearchSync(context.Background(), searchTask(t, "upsert", "art_inexistant")); err != nil {
		t.Fatalf("HandleSearchSync: %v", err)
	}
	if len(mock.deleted) != 1 || mock.deleted[0] != "art_inexistant" {
		t.Fatalf("deleted = %v, attendu suppression de l'article inconnu", mock.deleted)
	}
}

func TestSearch_HandleSync_MeliError_Returned(t *testing.T) {
	mock := &mockSyncer{err: errors.New("meili down")}
	worker := newTestSearchWorker(t, mock)
	if err := worker.HandleSearchSync(context.Background(), searchTask(t, "delete", "art_x")); err == nil {
		t.Fatal("erreur Meili = nil, attendu erreur")
	}
}
