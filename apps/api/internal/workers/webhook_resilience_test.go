package workers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/meilisearch/meilisearch-go"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/resilience"
)

type failingSyncer struct {
	calls *atomic.Int32
	err   error
}

func (f failingSyncer) DeleteDocument(string, *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error) {
	f.calls.Add(1)
	return nil, f.err
}

func (f failingSyncer) AddDocuments(interface{}, *meilisearch.DocumentOptions) (*meilisearch.TaskInfo, error) {
	f.calls.Add(1)
	return nil, f.err
}

type fakeOutcomeStore struct {
	active       bool
	failures     int
	autoDisabled bool
	resetCalls   int
	notifyCalls  int
	lastReason   string
	ownerID      string
}

func (f *fakeOutcomeStore) IsActive(context.Context, string) (bool, error) {
	return f.active, nil
}

func (f *fakeOutcomeStore) ResetFailures(context.Context, string) error {
	f.resetCalls++
	f.failures = 0
	return nil
}

func (f *fakeOutcomeStore) RecordFailure(_ context.Context, _ string, threshold int, reason string) (string, string, int, bool, error) {
	f.failures++
	f.lastReason = reason
	if f.failures >= threshold {
		f.autoDisabled = true
		f.active = false
		return "Webhook Test", "pub_1", f.failures, true, nil
	}
	return "Webhook Test", "pub_1", f.failures, false, nil
}

func (f *fakeOutcomeStore) PublisherOwner(context.Context, string) (string, error) {
	return f.ownerID, nil
}

func (f *fakeOutcomeStore) NotifyDisabled(context.Context, string, string, string, string, int) error {
	f.notifyCalls++
	return nil
}

func TestWebhookWorker_HandleDeliver_TracksFailuresAutoDisablesAndResetsOn2xx(t *testing.T) {
	var code atomic.Int32
	code.Store(http.StatusBadGateway)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(int(code.Load()))
	}))
	defer srv.Close()

	store := &fakeOutcomeStore{active: true, ownerID: "11111111-1111-1111-1111-111111111111"}
	w := NewWebhookWorker(nil).WithTestHTTPClient(srv.Client(), func(string) error { return nil })
	w.SetDisableThreshold(3)
	w.outcomeDB = store

	makeDeliverTask := func() *asynq.Task {
		raw, _ := json.Marshal(queue.WebhookDeliverPayload{
			WebhookID:   "wh_1",
			PublisherID: "pub_1",
			URL:         srv.URL,
			Secret:      "sec",
			Event:       queue.TaskArticlePublished,
			Payload:     map[string]any{"articleId": "art_1"},
		})
		return asynq.NewTask(queue.TaskWebhookDeliver, raw)
	}

	// 2 échecs consécutifs -> pas encore désactivé, erreur remontée pour retry asynq.
	for i := 1; i <= 2; i++ {
		if err := w.HandleDeliver(context.Background(), makeDeliverTask()); err == nil {
			t.Fatalf("tentative %d: erreur attendue sur HTTP 502", i)
		}
		if store.autoDisabled || store.notifyCalls != 0 {
			t.Fatalf("désactivé prématurément à l'échec %d", i)
		}
	}

	// 1 succès avant le seuil -> réinitialise le compteur à 0.
	code.Store(http.StatusOK)
	if err := w.HandleDeliver(context.Background(), makeDeliverTask()); err != nil {
		t.Fatalf("succès attendu sur 200: %v", err)
	}
	if store.resetCalls != 1 || store.failures != 0 {
		t.Fatalf("reset attendu après 200 (resetCalls=%d failures=%d)", store.resetCalls, store.failures)
	}

	// 3 nouveaux échecs consécutifs -> auto-désactivation + notification propriétaire.
	code.Store(http.StatusInternalServerError)
	for i := 1; i <= 3; i++ {
		_ = w.HandleDeliver(context.Background(), makeDeliverTask())
	}
	if !store.autoDisabled || store.active {
		t.Fatalf("webhook doit être désactivé au seuil 3 (autoDisabled=%v active=%v)", store.autoDisabled, store.active)
	}
	if store.notifyCalls != 1 {
		t.Fatalf("notifyCalls = %d, attendu 1", store.notifyCalls)
	}

	// Nouvelle tâche après désactivation -> ignorée sans appel HTTP.
	code.Store(http.StatusOK)
	store.resetCalls = 0
	if err := w.HandleDeliver(context.Background(), makeDeliverTask()); err != nil {
		t.Fatalf("HandleDeliver sur webhook désactivé doit retourner nil: %v", err)
	}
	if store.resetCalls != 0 {
		t.Fatal("webhook désactivé ne doit pas exécuter la livraison")
	}
}

func TestWebhookWorker_EnqueueDeliverFanoutAndMetrics(t *testing.T) {
	mr := miniredis.RunT(t)
	ac := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	defer ac.Close()

	w := NewWebhookWorker(nil)
	w.SetAsynqClient(ac)

	if err := w.enqueueDeliver("wh_1", "pub_1", "https://example.com/1", "s1", queue.TaskArticlePublished, "evt_1", map[string]any{"a": 1}); err != nil {
		t.Fatalf("enqueueDeliver 1: %v", err)
	}
	if err := w.enqueueDeliver("wh_2", "pub_1", "https://example.com/2", "s2", queue.TaskArticlePublished, "evt_1", map[string]any{"a": 1}); err != nil {
		t.Fatalf("enqueueDeliver 2: %v", err)
	}
	// Même eventID + webhookID -> dédupliqué sans erreur par Asynq TaskID.
	if err := w.enqueueDeliver("wh_1", "pub_1", "https://example.com/1", "s1", queue.TaskArticlePublished, "evt_1", map[string]any{"a": 1}); err != nil {
		t.Fatalf("enqueueDeliver idempotent: %v", err)
	}

	_ = w.recordOutcome(context.Background(), "wh_1", queue.TaskArticlePublished, true, "")
	metrics := observability.Default().Render()
	if !strings.Contains(metrics, `qoe_webhook_deliveries_total{event="article.published",outcome="success"}`) {
		t.Fatalf("métrique webhook absente:\n%s", metrics)
	}
}

func TestSearchAndEmbedding_CircuitBreakerOpens(t *testing.T) {
	// SearchWorker : pannes répétées sur Meilisearch ouvrent le breaker.
	var searchCalls atomic.Int32
	sw := &SearchWorker{
		cb: resilience.NewCircuitBreaker(resilience.Options{
			Name:             "test-meilisearch",
			FailureThreshold: 2,
			Cooldown:         time.Minute,
			CallTimeout:      time.Second,
			Registry:         observability.NewRegistry(),
		}),
		idx: failingSyncer{calls: &searchCalls, err: errors.New("meili down")},
	}
	task := func() *asynq.Task {
		raw, _ := json.Marshal(queue.SearchSyncPayload{ArticleID: "art_1", Action: "delete"})
		return asynq.NewTask(queue.TaskSearchSync, raw)
	}
	_ = sw.HandleSearchSync(context.Background(), task())
	_ = sw.HandleSearchSync(context.Background(), task())
	err := sw.HandleSearchSync(context.Background(), task())
	if !errors.Is(err, resilience.ErrCircuitOpen) {
		t.Fatalf("3e appel Meilisearch attendu ErrCircuitOpen, obtenu %v", err)
	}
	if searchCalls.Load() != 2 {
		t.Fatalf("searchCalls = %d, attendu 2 (le 3e court-circuité)", searchCalls.Load())
	}

	// httpEmbedClient : 500 répétés ouvrent le breaker, 400 ne l'ouvre pas.
	var embedCalls atomic.Int32
	var embedStatus atomic.Int32
	embedStatus.Store(http.StatusBadRequest)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		embedCalls.Add(1)
		w.WriteHeader(int(embedStatus.Load()))
	}))
	defer srv.Close()

	ec := &httpEmbedClient{
		base:  srv.URL,
		model: "test-model",
		http:  srv.Client(),
		cb: resilience.NewCircuitBreaker(resilience.Options{
			Name:             "test-embed",
			FailureThreshold: 2,
			Cooldown:         time.Minute,
			CallTimeout:      time.Second,
			Registry:         observability.NewRegistry(),
		}),
	}
	for i := 0; i < 3; i++ {
		if _, err := ec.Embed(context.Background(), "hello"); err == nil {
			t.Fatal("erreur 400 attendue")
		}
	}
	if ec.cb.State() != resilience.StateClosed {
		t.Fatalf("HTTP 400 ne doit pas ouvrir le breaker (state=%s)", ec.cb.State())
	}

	embedStatus.Store(http.StatusInternalServerError)
	_, _ = ec.Embed(context.Background(), "hello")
	_, _ = ec.Embed(context.Background(), "hello")
	callsBefore := embedCalls.Load()
	_, err = ec.Embed(context.Background(), "hello")
	if !errors.Is(err, resilience.ErrCircuitOpen) {
		t.Fatalf("3e 500 attendu ErrCircuitOpen, obtenu %v", err)
	}
	if embedCalls.Load() != callsBefore {
		t.Fatal("le breaker ouvert ne doit pas appeler l'upstream embeddings")
	}
}
