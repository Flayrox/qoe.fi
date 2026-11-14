package workers

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

// testSecret est le secret utilisé par le seed du worker.
const testSecret = "test_secret_123"

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}
// requirePool skippe les tests DB quand Docker/testcontainers est absent.
func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}


// sigServer crée un endpoint qui vérifie X-Qoe-Signature + X-Qoe-Event puis
// répond avec le code donné. Incrémente calls à chaque requête reçue.
func sigServer(statusCode int, calls *atomic.Int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		body, _ := io.ReadAll(r.Body)

		if r.Header.Get("X-Qoe-Event") == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		want := "sha256=" + signHMAC(testSecret, body)
		if !hmac.Equal([]byte(r.Header.Get("X-Qoe-Signature")), []byte(want)) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(statusCode)
		if statusCode == http.StatusOK {
			_, _ = w.Write([]byte("delivered"))
		}
	}))
}

// seedWorker crée une publication + un webhook actif abonné à
// article.published pointant vers url, avec testSecret.
func seedWorker(t *testing.T, url string) (publisherID, webhookID string) {
	requirePool(t)
	t.Helper()
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := poolTest.Exec(context.Background(),
		`UPDATE "Webhook" SET url = $1, secret = $2 WHERE id = $3`,
		url, testSecret, fx.WebhookID,
	); err != nil {
		t.Fatalf("update webhook url: %v", err)
	}
	return fx.PublisherID, fx.WebhookID
}

func makeTask(t *testing.T, publisherID string) *asynq.Task {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"publisherId": publisherID,
		"articleId":     "art_1",
		"title":         "Mon article",
		"slug":          "mon-article",
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return asynq.NewTask("article.published", payload)
}

// lastDeliveryStatus retourne (status, httpStatus) de la delivery la plus
// récente du webhook.
func lastDeliveryStatus(t *testing.T, webhookID string) (string, int32) {
	t.Helper()
	var status string
	var httpStatus int32
	err := poolTest.QueryRow(context.Background(),
		`SELECT d.status, COALESCE(d."httpStatus", 0)
		 FROM "WebhookDelivery" d
		 WHERE d."webhookId" = $1
		 ORDER BY d."createdAt" DESC LIMIT 1`,
		webhookID,
	).Scan(&status, &httpStatus)
	if err != nil {
		t.Fatalf("dernière delivery: %v", err)
	}
	return status, httpStatus
}

type workerRoundTripFunc func(*http.Request) (*http.Response, error)

func (f workerRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func newTestWebhookWorker(server *httptest.Server) *WebhookWorker {
	w := NewWebhookWorker(poolTest)
	target, _ := url.Parse(server.URL)
	client := &http.Client{Transport: workerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		clone := req.Clone(req.Context())
		clone.URL.Scheme = target.Scheme
		clone.URL.Host = target.Host
		return server.Client().Transport.RoundTrip(clone)
	})}
	// Le serveur httptest vit sur loopback, que le garde-fou anti-SSRF refuse :
	// on neutralise le validateur UNIQUEMENT ici (cf. WithTestHTTPClient).
	return w.WithTestHTTPClient(client, func(string) error { return nil })
}

func TestWebhookWorker_DefaultClientBlocksLoopback(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	worker := NewWebhookWorker(nil)
	resp, err := worker.client().Get(srv.URL)
	if err == nil {
		resp.Body.Close()
		t.Fatalf("worker.client().Get(%s) aurait dû être bloqué par netguard", srv.URL)
	}
	if called {
		t.Fatal("le serveur loopback a été appelé malgré SafeHTTPClient")
	}
}

func TestHandleProcesses_Success_SignedAndRecorded(t *testing.T) {
	var calls atomic.Int32
	server := sigServer(http.StatusOK, &calls)
	defer server.Close()

	pubID, webhookID := seedWorker(t, "https://webhook.example.com/hook")

	worker := newTestWebhookWorker(server)
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubID), "article.published"); err != nil {
		t.Fatalf("HandleProcesses: %v", err)
	}

	// Le endpoint a reçu exactement 1 requête (webhook actif + abonné).
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, attendu 1", calls.Load())
	}

	// La delivery est enregistrée SUCCESS avec HTTP 200.
	status, httpStatus := lastDeliveryStatus(t, webhookID)
	if status != "SUCCESS" {
		t.Fatalf("status = %q, attendu SUCCESS", status)
	}
	if httpStatus != 200 {
		t.Fatalf("httpStatus = %d, attendu 200", httpStatus)
	}
}

func TestHandleProcesses_ServerError_RecordedFailed(t *testing.T) {
	var calls atomic.Int32
	server := sigServer(http.StatusInternalServerError, &calls)
	defer server.Close()

	pubID, webhookID := seedWorker(t, "https://webhook.example.com/hook")

	worker := newTestWebhookWorker(server)
	// Le worker ne remonte pas l'erreur HTTP (dispatch échoue mais le worker
	// logge et continue — comportement actuel) → nil ici.
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubID), "article.published"); err != nil {
		t.Fatalf("HandleProcesses: %v", err)
	}

	if calls.Load() != 1 {
		t.Fatalf("calls = %d, attendu 1", calls.Load())
	}
	status, httpStatus := lastDeliveryStatus(t, webhookID)
	if status != "FAILED" {
		t.Fatalf("status = %q, attendu FAILED (500)", status)
	}
	if httpStatus != 500 {
		t.Fatalf("httpStatus = %d, attendu 500", httpStatus)
	}
}

func TestHandleProcesses_EventNotSubscribed_NoCall(t *testing.T) {
	var calls atomic.Int32
	server := sigServer(http.StatusOK, &calls)
	defer server.Close()

	pubID, _ := seedWorker(t, "https://webhook.example.com/hook")

	// Événement non souscrit par le webhook (article.updated) → aucun appel.
	payload, err := json.Marshal(map[string]any{"publisherId": pubID})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	worker := newTestWebhookWorker(server)
	if err := worker.HandleProcesses(context.Background(), asynq.NewTask("article.updated", payload), "article.updated"); err != nil {
		t.Fatalf("HandleProcesses: %v", err)
	}

	if calls.Load() != 0 {
		t.Fatalf("calls = %d, attendu 0 (webhook non abonné à article.updated)", calls.Load())
	}
}

func TestHandleProcesses_MissingPublisherID_NoOp(t *testing.T) {
	var calls atomic.Int32
	server := sigServer(http.StatusOK, &calls)
	defer server.Close()

	seedWorker(t, "https://webhook.example.com/hook")

	payload, _ := json.Marshal(map[string]any{"foo": "bar"})
	worker := newTestWebhookWorker(server)
	if err := worker.HandleProcesses(context.Background(), asynq.NewTask("article.published", payload), "article.published"); err != nil {
		t.Fatalf("HandleProcesses: %v", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("calls = %d, attendu 0 (pas de publisherId)", calls.Load())
	}
}

// Vérifie que le body envoyé contient bien l'événement et les données.
func TestHandleProcesses_PayloadShape(t *testing.T) {
	got := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var parsed map[string]any
		_ = json.Unmarshal(body, &parsed)
		got <- parsed
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	pubID, _ := seedWorker(t, "https://webhook.example.com/hook")

	worker := newTestWebhookWorker(server)
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubID), "article.published"); err != nil {
		t.Fatalf("HandleProcesses: %v", err)
	}

	payload := <-got
	if payload["event"] != "article.published" {
		t.Fatalf("event = %v, attendu article.published", payload["event"])
	}
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("data absent du payload: %v", payload)
	}
	if !strings.Contains(data["articleId"].(string), "art_1") {
		t.Fatalf("articleId = %v, attendu art_1", data["articleId"])
	}
	if _, ok := payload["timestamp"].(string); !ok {
		t.Fatal("timestamp manquant")
	}
}
