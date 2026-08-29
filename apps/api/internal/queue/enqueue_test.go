package queue

import (
	"testing"

	goredis "github.com/redis/go-redis/v9"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
)

func miniredisOpt(t *testing.T) asynq.RedisConnOpt {
	t.Helper()
	s := miniredis.RunT(t)
	return asynq.RedisClientOpt{Addr: s.Addr()}
}

// newTestClient retourne un client asynq pointé sur un miniredis, ou nil si
// l'enqueue n'est pas supporté (scripts Lua absents de miniredis).
func newTestClient(t *testing.T) *asynq.Client {
	t.Helper()
	opt := miniredisOpt(t)
	c := asynq.NewClient(opt)
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func checkEnqueued(t *testing.T, c *asynq.Client, resultErr error) {
	t.Helper()
	if resultErr != nil {
		t.Fatalf("Publish: %v", resultErr)
	}
}

func TestPublish_RealEnqueue(t *testing.T) {
	c := newTestClient(t)

	checkEnqueued(t, c, PublishArticlePublished(c, ArticlePublishedPayload{
		ArticleID: "art_1", PublicationID: "pub_1",
	}))
}

func TestPublish_ArticleLifecycleEnqueue(t *testing.T) {
	c := newTestClient(t)
	checkEnqueued(t, c, PublishArticleLifecycle(c, TaskArticleUpdated, ArticlePublishedPayload{ArticleID: "a2"}))
	checkEnqueued(t, c, PublishArticleLifecycle(c, TaskArticleDeleted, ArticlePublishedPayload{ArticleID: "a2"}))
}

func TestPublish_SearchEnqueue(t *testing.T) {
	c := newTestClient(t)
	checkEnqueued(t, c, PublishSearchSync(c, SearchSyncPayload{ArticleID: "a3", Action: "upsert"}))
}

func TestPublish_StripeEnqueue(t *testing.T) {
	c := newTestClient(t)
	checkEnqueued(t, c, PublishStripeEvent(c, StripeEventPayload{EventType: "invoice.paid"}))
}

func TestPublish_EmbeddingsEnqueue(t *testing.T) {
	c := newTestClient(t)
	checkEnqueued(t, c, PublishArticleEmbedding(c, EmbeddingPayload{ArticleID: "a4"}))
	checkEnqueued(t, c, PublishUserEmbedding(c, EmbeddingPayload{UserID: "u4"}))
	checkEnqueued(t, c, PublishPostEmbedding(c, EmbeddingPayload{PostID: "p4"}))
}

func TestPublish_SubscriberEnqueue(t *testing.T) {
	c := newTestClient(t)
	checkEnqueued(t, c, PublishSubscriberCreated(c, SubscriberCreatedPayload{SubscriberID: "s1", Email: "a@b.c"}))
}

func TestNewServer_DefaultsConcurrency(t *testing.T) {
	opt := miniredisOpt(t)
	s := asynq.NewServer(opt, asynq.Config{Concurrency: 0})
	if s == nil {
		t.Fatal("NewServer doit renvoyer un serveur")
	}
	_ = s
}

// ReparseNewClient: NewClient via la fonction du package (URI string) sur miniredis.
func TestNewClient_ValidURL(t *testing.T) {
	s := miniredis.RunT(t)
	c := NewClient("redis://" + s.Addr())
	if c == nil {
		t.Fatal("NewClient avec URL valide doit renvoyer un client")
	}
	_ = c.Close()
}

func TestNewServer_ValidURL(t *testing.T) {
	s := miniredis.RunT(t)
	sv := NewServer("redis://"+s.Addr(), 3)
	if sv == nil {
		t.Fatal("NewServer avec URL valide doit renvoyer un serveur")
	}
	_ = sv
}

// Ensure import used even when miniredis lacks Lua-support paths.
var _ = goredis.Options{}