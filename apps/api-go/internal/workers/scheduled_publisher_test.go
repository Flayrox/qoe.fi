package workers

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestPublishScheduledArticlePayload(t *testing.T) {
	before := time.Now().UTC()
	a := ScheduledArticle{
		ID:            "art_1",
		PublicationID: "pub_1",
		AuthorID:      "auth_1",
		Title:         "Mon article programmé",
		Slug:          "mon-article-programme",
		Visibility:    "PUBLIC",
	}

	p := PublishScheduledArticlePayload(a)

	if p.EventID != "article_published_art_1" {
		t.Errorf("EventID = %q, attendu %q", p.EventID, "article_published_art_1")
	}
	if p.PublicationID != "pub_1" || p.ArticleID != "art_1" || p.AuthorID != "auth_1" {
		t.Errorf("IDs du payload incorrects : %+v", p)
	}
	if p.Title != "Mon article programmé" || p.Slug != "mon-article-programme" {
		t.Errorf("Title/Slug du payload incorrects : %+v", p)
	}
	if p.Visibility != "PUBLIC" {
		t.Errorf("Visibility = %q, attendu PUBLIC", p.Visibility)
	}

	// PublishedAt doit être un RFC3339 proche de maintenant (et pas vide).
	parsed, err := time.Parse(time.RFC3339, p.PublishedAt)
	if err != nil {
		t.Fatalf("PublishedAt invalide (%q) : %v", p.PublishedAt, err)
	}
	if parsed.Before(before.Add(-time.Minute)) || parsed.After(time.Now().UTC().Add(time.Minute)) {
		t.Errorf("PublishedAt hors fenêtre : %v", parsed)
	}

	// Le payload doit être sérialisable (asynq le marshalera à l'enqueue).
	jsonPayload, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("payload non sérialisable : %v", err)
	}
	if !strings.Contains(string(jsonPayload), `"articleId":"art_1"`) {
		t.Errorf("JSON du payload incomplet : %s", jsonPayload)
	}
}
