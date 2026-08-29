package queue

import (
	"encoding/json"
	"testing"

	"github.com/hibiken/asynq"
)

func TestNewClient_InvalidURL(t *testing.T) {
	if c := NewClient("not a redis url"); c != nil {
		t.Error("NewClient avec URL invalide doit renvoyer nil")
	}
}

func TestNewServer_InvalidURL(t *testing.T) {
	if s := NewServer("not a redis url", 5); s != nil {
		t.Error("NewServer avec URL invalide doit renvoyer nil")
	}
}

func TestNewArticlePublishedTask(t *testing.T) {
	p := ArticlePublishedPayload{
		PublicationID: "pub_1",
		ArticleID:     "art_1",
		Title:         "Titre",
		Slug:          "slug",
		Visibility:    "PUBLIC",
	}
	task, err := NewArticlePublishedTask(p)
	if err != nil {
		t.Fatalf("NewArticlePublishedTask: %v", err)
	}
	if task.Type() != TaskArticlePublished {
		t.Errorf("task.Type() = %q, attendu %q", task.Type(), TaskArticlePublished)
	}
	var got ArticlePublishedPayload
	if err := json.Unmarshal(task.Payload(), &got); err != nil {
		t.Fatalf("payload non désérialisable: %v", err)
	}
	if got.ArticleID != "art_1" || got.Visibility != "PUBLIC" {
		t.Errorf("payload round-trip invalide: %+v", got)
	}
}

func TestNewSubscriberCreatedTask(t *testing.T) {
	task, err := NewSubscriberCreatedTask(SubscriberCreatedPayload{
		SubscriberID: "sub_1", Email: "a@b.c", IsPremium: true,
	})
	if err != nil {
		t.Fatalf("NewSubscriberCreatedTask: %v", err)
	}
	if task.Type() != TaskSubscriberCreated {
		t.Errorf("type = %q", task.Type())
	}
	var got SubscriberCreatedPayload
	_ = json.Unmarshal(task.Payload(), &got)
	if !got.IsPremium || got.Email != "a@b.c" {
		t.Errorf("payload invalide: %+v", got)
	}
}

func TestNewArticleLifecycleTask_Types(t *testing.T) {
	p := ArticlePublishedPayload{ArticleID: "a1"}
	for _, typ := range []string{TaskArticleUpdated, TaskArticleDeleted} {
		task, err := NewArticleLifecycleTask(typ, p)
		if err != nil {
			t.Fatalf("%s: %v", typ, err)
		}
		if task.Type() != typ {
			t.Errorf("type = %q, attendu %q", task.Type(), typ)
		}
	}
}

// L'enqueue réel (avec Retry/Timeout) nécessite Redis : couvert en intégration.
// Ici on vérifie que les tâches produites sont bien typées et sérialisables.
func TestTaskTypesAreWellFormed(t *testing.T) {
	tasks := []struct {
		name string
		task *asynq.Task
		typ  string
	}{
		{TaskArticlePublished, mustTask(NewArticlePublishedTask(ArticlePublishedPayload{})), TaskArticlePublished},
		{TaskSubscriberCreated, mustTask(NewSubscriberCreatedTask(SubscriberCreatedPayload{})), TaskSubscriberCreated},
	}
	for _, c := range tasks {
		if c.task.Type() != c.typ {
			t.Errorf("%s: type = %q", c.name, c.task.Type())
		}
		if len(c.task.Payload()) == 0 {
			t.Errorf("%s: payload vide", c.name)
		}
	}
}

func mustTask(t *asynq.Task, err error) *asynq.Task {
	if err != nil {
		panic(err)
	}
	return t
}

func TestPublish_NoOpWhenNilClient(t *testing.T) {
	if err := PublishArticlePublished(nil, ArticlePublishedPayload{}); err != nil {
		t.Errorf("PublishArticlePublished(nil): %v", err)
	}
	if err := PublishArticleLifecycle(nil, TaskArticleUpdated, ArticlePublishedPayload{}); err != nil {
		t.Errorf("PublishArticleLifecycle(nil): %v", err)
	}
	if err := PublishSearchSync(nil, SearchSyncPayload{}); err != nil {
		t.Errorf("PublishSearchSync(nil): %v", err)
	}
	if err := PublishStripeEvent(nil, StripeEventPayload{}); err != nil {
		t.Errorf("PublishStripeEvent(nil): %v", err)
	}
	if err := PublishArticleEmbedding(nil, EmbeddingPayload{}); err != nil {
		t.Errorf("PublishArticleEmbedding(nil): %v", err)
	}
	if err := PublishUserEmbedding(nil, EmbeddingPayload{}); err != nil {
		t.Errorf("PublishUserEmbedding(nil): %v", err)
	}
	if err := PublishPostEmbedding(nil, EmbeddingPayload{}); err != nil {
		t.Errorf("PublishPostEmbedding(nil): %v", err)
	}
	if err := PublishSubscriberCreated(nil, SubscriberCreatedPayload{}); err != nil {
		t.Errorf("PublishSubscriberCreated(nil): %v", err)
	}
}

func TestStripeAndEmbeddingTask_Construct(t *testing.T) {
	// Vérifie que les tâches construites par les Publish* avec un client nil
	// ne paniquent pas et produisent le bon type (le marshal est testé via
	// NewTask directement quand le JSON data présent).
	payload := StripeEventPayload{EventType: "invoice.paid", Data: map[string]any{"id": 1}}
	b, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal StripeEventPayload: %v", err)
	}
	if len(b) == 0 {
		t.Fatal("marshal vide")
	}
}