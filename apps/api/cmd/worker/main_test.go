package main

import (
	"context"
	"errors"
	"log"
	"os"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/cache"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/testutil"
	"github.com/qoefi/api/internal/workers"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func testDeps() workerDeps {
	return workerDeps{
		webhook:    workers.NewWebhookWorker(poolTest),
		newsletter: workers.NewNewsletterWorker(poolTest),
		stripe:     workers.NewStripeWorker(poolTest, cache.Client("redis://127.0.0.1:1")),
		search:     workers.NewSearchWorker(poolTest),
		embedding:  workers.NewEmbeddingWorker(poolTest),
	}
}

// TestBuildHandlers : toutes les tâches connues sont câblées, et aucune
// autre (le mux asynq rejetterait une tâche inconnue).
func TestBuildHandlers(t *testing.T) {
	handlers := buildHandlers(testDeps())
	expected := []string{
		queue.TaskArticlePublished,
		queue.TaskArticleUpdated,
		queue.TaskArticleDeleted,
		queue.TaskSubscriberCreated,
		queue.TaskPostLiked,
		queue.TaskStripeEvent,
		queue.TaskSearchSync,
		queue.TaskArticleEmbedding,
		queue.TaskUserEmbedding,
		queue.TaskPostEmbedding,
		queue.TaskNewsletterSend,
	}
	if len(handlers) != len(expected) {
		t.Fatalf("handlers = %d, attendu %d", len(handlers), len(expected))
	}
	for _, typ := range expected {
		if fn, ok := handlers[typ]; !ok || fn == nil {
			t.Fatalf("tâche %q non câblée", typ)
		}
	}
}

// TestWorkerMuxDispatch : le mux route chaque tâche connue vers son handler
// (erreur métier ≠ ErrUnhandledTaskType prouve que le handler a tourné) et
// rejette les types inconnus.
func TestWorkerMuxDispatch(t *testing.T) {
	mux := asynq.NewServeMux()
	for typ, fn := range buildHandlers(testDeps()) {
		mux.HandleFunc(typ, fn)
	}
	ctx := context.Background()

	// Type inconnu → ErrHandlerNotFound (aucun handler).
	unknown := asynq.NewTask("qoe.unknown.task", []byte(`{}`))
	if err := mux.ProcessTask(ctx, unknown); !errors.Is(err, asynq.ErrHandlerNotFound) {
		t.Fatalf("tâche inconnue = %v, attendu ErrHandlerNotFound", err)
	}

	// Chaque tâche connue atteint un handler réel : payload vide → erreur
	// métier (décodage/payload) et non « non gérée ».
	payloads := map[string][]byte{
		queue.TaskArticlePublished:   []byte(`{}`),
		queue.TaskArticleUpdated:     []byte(`{}`),
		queue.TaskArticleDeleted:     []byte(`{}`),
		queue.TaskSubscriberCreated:  []byte(`{}`),
		queue.TaskPostLiked:          []byte(`{}`),
		queue.TaskStripeEvent:        []byte(`{}`),
		queue.TaskSearchSync:         []byte(`{}`),
		queue.TaskArticleEmbedding:   []byte(`{}`),
		queue.TaskUserEmbedding:      []byte(`{}`),
		queue.TaskPostEmbedding:      []byte(`{}`),
	}
	for typ, payload := range payloads {
		task := asynq.NewTask(typ, payload)
		err := mux.ProcessTask(ctx, task)
		if errors.Is(err, asynq.ErrHandlerNotFound) {
			t.Fatalf("tâche %q non gérée par le mux", typ)
		}
	}
}
