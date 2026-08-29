package workers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/meilisearch/meilisearch-go"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
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

func TestStripe_PaymentFailed_SetsPastDue(t *testing.T) {
	pubID, _ := seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Subscriber" (id, email, "publicationId", status, "isActive", "isPremium", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'failed@test.dev', $1, 'ACTIVE', true, true, now())`,
		pubID,
	); err != nil {
		t.Fatalf("subscriber: %v", err)
	}

	if err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_failed", "invoice.payment_failed", map[string]any{
		"metadata": map[string]any{
			"creatorId":       pubID,
			"subscriberEmail": "failed@test.dev",
		},
	})); err != nil {
		t.Fatalf("HandleStripeEvent: %v", err)
	}

	var status string
	var active bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, "isActive" FROM "Subscriber" WHERE email = 'failed@test.dev'`,
	).Scan(&status, &active); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if status != "PAST_DUE" || active {
		t.Fatalf("subscriber = %q/%v, attendu PAST_DUE/inactif", status, active)
	}
}

// resolvePublicationID doit retomber sur la publication personnelle quand
// creatorRef est un user (et non une publication).
func TestStripe_PaymentFailed_PersonalPublicationFallback(t *testing.T) {
	_, ownerID := seedStripe(t)
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	worker := NewStripeWorker(poolTest, nil)

	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Subscriber" (id, email, "publicationId", status, "isActive", "isPremium", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'personal@test.dev', $1, 'ACTIVE', true, true, now())`,
		fx.PublicationID,
	); err != nil {
		t.Fatalf("subscriber: %v", err)
	}

	if err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_personal", "invoice.payment_failed", map[string]any{
		"metadata": map[string]any{
			"creatorId":       ownerID,
			"subscriberEmail": "personal@test.dev",
		},
	})); err != nil {
		t.Fatalf("HandleStripeEvent: %v", err)
	}

	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM "Subscriber" WHERE email = 'personal@test.dev'`,
	).Scan(&status); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if status != "PAST_DUE" {
		t.Fatalf("subscriber = %q, attendu PAST_DUE via publication personnelle", status)
	}
}

func TestStripe_PaymentFailed_MissingMetadata_NoOp(t *testing.T) {
	seedStripe(t)
	worker := NewStripeWorker(poolTest, nil)

	if err := worker.HandleStripeEvent(context.Background(), stripeTask(t, "evt_nometadata", "invoice.payment_failed", nil)); err != nil {
		t.Fatalf("metadata absente = erreur, attendu no-op silencieux: %v", err)
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

// ─── Embedding worker (jina-embeddings-v3) ───────────────────────────

// mockEmbedder imite le service d'inférence (vecteur 1024 dims, tronqué en
// 512 par le worker via MRL).
type mockEmbedder struct {
	vec []float32
	err error
}

func (m *mockEmbedder) Embed(_ context.Context, _ string) ([]float32, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.vec, nil
}

func vec1024() []float32 {
	v := make([]float32, 1024)
	for i := range v {
		v[i] = 0.01 * float32(i%97)
	}
	return v
}

func TestEmbedding_Normalize_StripsHTMLAndPaywall(t *testing.T) {
	got := normalizeForEmbedding("Titre", `<h1>Titre</h1><p>Intro <b>gratuite</b></p><div data-type="paywall-divider"></div><p>Contenu PAYANT SENSIBLE</p>`)
	if !strings.Contains(got, "Intro gratuite") {
		t.Fatalf("normalize: intro absente -> %q", got)
	}
	if strings.Contains(got, "PAYANT") {
		t.Fatalf("normalize: contenu premium leaké -> %q", got)
	}
	if strings.Contains(got, "<p>") || strings.Contains(got, "<div>") {
		t.Fatalf("normalize: HTML résiduel -> %q", got)
	}
	if strings.Contains(got, "  ") {
		t.Fatalf("normalize: espaces multiples -> %q", got)
	}
}

func TestEmbedding_Normalize_TruncatesLongText(t *testing.T) {
	long := strings.Repeat("mot ", 20000) // ~100k chars
	got := normalizeForEmbedding("T", long)
	if len(got) > 32000 {
		t.Fatalf("normalize: pas de troncature (%d chars)", len(got))
	}
}

func TestEmbedding_HandleArticleEmbedding_UpsertsVector(t *testing.T) {
	t.Setenv(envEmbeddingURL, "http://embed.test")
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	_ = fx

	var articleID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Article" WHERE slug = 'premier-article'`,
	).Scan(&articleID); err != nil {
		t.Fatalf("article: %v", err)
	}

	worker := &EmbeddingWorker{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: &mockEmbedder{vec: vec1024()},
	}
	payload, _ := json.Marshal(map[string]any{"articleId": articleID})
	if err := worker.HandleArticleEmbedding(context.Background(), asynq.NewTask("embedding.article", payload)); err != nil {
		t.Fatalf("HandleArticleEmbedding: %v", err)
	}

	var has bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT ("embedding" IS NOT NULL) FROM "Article" WHERE id = $1`, articleID,
	).Scan(&has); err != nil {
		t.Fatalf("embedding read: %v", err)
	}
	if !has {
		t.Fatal("embedding non persisté en base")
	}
}

func TestEmbedding_HandlePostEmbedding_UpsertsVector(t *testing.T) {
	t.Setenv(envEmbeddingURL, "http://embed.test")

	// Une pensée racine du seed posts (contenu + tags).
	var postID string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Post" (id, content, "authorId", tags, "createdAt", "updatedAt")
		 VALUES ('post-embed-test', 'Le foot, c''est la seule religion qui rassemble. #ligue1',
		         (SELECT id FROM "User" LIMIT 1), ARRAY['foot','ligue1'], now(), now())
		 RETURNING id`,
	).Scan(&postID); err != nil {
		t.Fatalf("seed post: %v", err)
	}

	worker := &EmbeddingWorker{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: &mockEmbedder{vec: vec1024()},
	}
	payload, _ := json.Marshal(map[string]any{"postId": postID})
	if err := worker.HandlePostEmbedding(context.Background(), asynq.NewTask("embedding.post", payload)); err != nil {
		t.Fatalf("HandlePostEmbedding: %v", err)
	}

	var has bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT ("embedding" IS NOT NULL) FROM "Post" WHERE id = $1`, postID,
	).Scan(&has); err != nil {
		t.Fatalf("embedding read: %v", err)
	}
	if !has {
		t.Fatal("embedding post non persisté en base")
	}
}

func TestEmbedding_HandlePostEmbedding_MissingID_Errors(t *testing.T) {
	t.Setenv(envEmbeddingURL, "http://embed.test")
	worker := &EmbeddingWorker{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: &mockEmbedder{vec: vec1024()},
	}
	payload, _ := json.Marshal(map[string]any{})
	if err := worker.HandlePostEmbedding(context.Background(), asynq.NewTask("embedding.post", payload)); err == nil {
		t.Fatal("postId manquant devrait être une erreur")
	}
}

func TestEmbedding_HandleArticleEmbedding_WrongDimension_Errors(t *testing.T) {
	t.Setenv(envEmbeddingURL, "http://embed.test")
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	var articleID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Article" WHERE slug = 'premier-article'`,
	).Scan(&articleID); err != nil {
		t.Fatalf("article: %v", err)
	}
	_ = fx

	worker := &EmbeddingWorker{
		pool:     poolTest,
		q:        db.New(poolTest),
		embedder: &mockEmbedder{vec: make([]float32, 128)}, // trop court vs MRL 512
	}
	payload, _ := json.Marshal(map[string]any{"articleId": articleID})
	if err := worker.HandleArticleEmbedding(context.Background(), asynq.NewTask("embedding.article", payload)); err == nil {
		t.Fatal("dimension 128 = nil, attendu erreur (MRL 512 attendu)")
	}
}

// embedServer simule le service d'inférence (API OpenAI-compatible).
func embedServer(t *testing.T, status int, dims int, capture *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("décodage requête: %v", err)
		}
		if capture != nil {
			*capture = body
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		emb := make([]float32, dims)
		for i := range emb {
			emb[i] = float32(i) * 0.01
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{"embedding": emb}},
		})
	}))
}

func TestEmbedding_Client_SendsTaskAndModel(t *testing.T) {
	var got map[string]any
	srv := embedServer(t, http.StatusOK, 512, &got)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, model: "jina-embeddings-v3", task: "retrieval.passage", http: srv.Client()}
	vec, err := c.Embed(context.Background(), "titre")
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if len(vec) != 512 {
		t.Fatalf("len(vec) = %d, attendu 512", len(vec))
	}
	if got["model"] != "jina-embeddings-v3" || got["task"] != "retrieval.passage" || got["input"] != "titre" {
		t.Fatalf("payload = %v", got)
	}
}

func TestEmbedding_Client_OmitsTaskWhenEmpty(t *testing.T) {
	var got map[string]any
	srv := embedServer(t, http.StatusOK, 512, &got)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, model: "m", http: srv.Client()}
	if _, err := c.Embed(context.Background(), "x"); err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if _, present := got["task"]; present {
		t.Fatal("task ne doit pas être envoyé quand vide (llama.cpp)")
	}
}

func TestEmbedding_Client_HTTPError(t *testing.T) {
	srv := embedServer(t, http.StatusBadGateway, 512, nil)
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, http: srv.Client()}
	if _, err := c.Embed(context.Background(), "x"); err == nil {
		t.Fatal("Embed doit échouer sur statut non-200")
	}
}

func TestEmbedding_Client_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	c := &httpEmbedClient{base: srv.URL, http: srv.Client()}
	if _, err := c.Embed(context.Background(), "x"); err == nil {
		t.Fatal("Embed doit échouer sur réponse vide")
	}
}

func TestNewEmbeddingWorker_Defaults(t *testing.T) {
	t.Setenv(envEmbeddingURL, "http://infra:8081")
	t.Setenv(envEmbeddingModel, "jina-embeddings-v3")
	t.Setenv(envEmbeddingTask, "retrieval.passage")

	w := NewEmbeddingWorker(nil) // pool nil : construction uniquement
	if w == nil {
		t.Fatal("NewEmbeddingWorker = nil")
	}
	ec, ok := w.embedder.(*httpEmbedClient)
	if !ok {
		t.Fatalf("embedder de type %T, attendu *httpEmbedClient", w.embedder)
	}
	if ec.base != "http://infra:8081" || ec.model != "jina-embeddings-v3" || ec.task != "retrieval.passage" {
		t.Fatalf("client = %+v", ec)
	}
}

func TestEmbeddingWorker_EmbeddingDims(t *testing.T) {
	w := &EmbeddingWorker{}
	t.Setenv(envEmbeddingDims, "")
	if got := w.embeddingDims(); got != 512 {
		t.Fatalf("défaut = %d, attendu 512", got)
	}
	t.Setenv(envEmbeddingDims, "1024")
	if got := w.embeddingDims(); got != 1024 {
		t.Fatalf("env = %d, attendu 1024", got)
	}
	t.Setenv(envEmbeddingDims, "16")
	if got := w.embeddingDims(); got != 512 {
		t.Fatalf("16 → %d, attendu 512 (borne)", got)
	}
	t.Setenv(envEmbeddingDims, "abc")
	if got := w.embeddingDims(); got != 512 {
		t.Fatalf("abc → %d, attendu 512 (non numérique)", got)
	}
}

func TestEmbedding_HandleArticleEmbedding_NoEnv_Skips(t *testing.T) {
	t.Setenv(envEmbeddingURL, "")
	fx, err := testutil.SeedArticles(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	var articleID string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT id FROM "Article" WHERE slug = 'premier-article'`,
	).Scan(&articleID); err != nil {
		t.Fatalf("article: %v", err)
	}
	_ = fx

	worker := &EmbeddingWorker{pool: poolTest, q: db.New(poolTest)}
	payload, _ := json.Marshal(map[string]any{"articleId": articleID})
	if err := worker.HandleArticleEmbedding(context.Background(), asynq.NewTask("embedding.article", payload)); err != nil {
		t.Fatalf("sans EMBEDDING_URL: %v (attendu skip nil)", err)
	}
}
