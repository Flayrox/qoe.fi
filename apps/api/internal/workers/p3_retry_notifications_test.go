package workers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/testutil"
)

// ─── Retry de dispatch webhook ──────────────────────────────────────────────

// TestWebhook_DispatchRetry_RecordsEachDelivery vérifie que chaque tentative de
// dispatch (échec puis retry) est enregistrée comme une delivery distincte, et
// que le retry après un 500 aboutit à une delivery SUCCESS.
func TestWebhook_DispatchRetry_RecordsEachDelivery(t *testing.T) {
	var calls atomic.Int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if calls.Load() == 1 {
			w.WriteHeader(http.StatusInternalServerError) // 1re tentative : 500
			return
		}
		w.WriteHeader(http.StatusOK) // retry : 200
	}))
	defer server.Close()

	pubID, webhookID := seedWorker(t, server.URL)
	worker := NewWebhookWorker(poolTest)

	// 1re tentative → FAILED, 1 delivery.
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubID), "article.published"); err != nil {
		t.Fatalf("HandleProcesses (1): %v", err)
	}
	status, httpStatus := lastDeliveryStatus(t, webhookID)
	if status != "FAILED" || httpStatus != 500 {
		t.Fatalf("delivery après 500 = %s/%d, attendu FAILED/500", status, httpStatus)
	}

	// Retry → SUCCESS, 2e delivery (l'ancienne n'est pas écrasée).
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubID), "article.published"); err != nil {
		t.Fatalf("HandleProcesses (retry): %v", err)
	}
	status, httpStatus = lastDeliveryStatus(t, webhookID)
	if status != "SUCCESS" || httpStatus != 200 {
		t.Fatalf("delivery après retry = %s/%d, attendu SUCCESS/200", status, httpStatus)
	}

	var deliveries int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "WebhookDelivery" WHERE "webhookId" = $1`, webhookID,
	).Scan(&deliveries); err != nil {
		t.Fatalf("count deliveries: %v", err)
	}
	if deliveries != 2 {
		t.Fatalf("deliveries = %d, attendu 2 (échec + retry)", deliveries)
	}
}

// TestWebhook_TenantIsolation_LocalEventDoesNotDispatchForeignWebhooks : un
// événement pour la publication B ne doit JAMAIS atteindre les webhooks de la
// publication A (isolation tenant au niveau dispatch).
func TestWebhook_TenantIsolation_LocalEventDoesNotDispatchForeignWebhooks(t *testing.T) {
	var calls atomic.Int32
	server := sigServer(http.StatusOK, &calls)
	defer server.Close()

	// Webhook actif sur article.published pour la publication A.
	pubA, _ := seedWorker(t, server.URL)

	// Publication B (sans webhook) : un événement qui la concerne ne doit pas
	// déclencher le webhook de A.
	pubB := "pub_wh_tenant_b"
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Tenant B', 'tenant-b', now(), now())`, pubB); err != nil {
		t.Fatalf("publication B: %v", err)
	}

	worker := NewWebhookWorker(poolTest)
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubB), "article.published"); err != nil {
		t.Fatalf("HandleProcesses (pub B): %v", err)
	}

	if calls.Load() != 0 {
		t.Fatalf("calls = %d, attendu 0 (webhook du tenant A déclenché par l'événement du tenant B)", calls.Load())
	}

	// Contre-preuve : l'événement pour la publication A déclenche bien son webhook.
	if err := worker.HandleProcesses(context.Background(), makeTask(t, pubA), "article.published"); err != nil {
		t.Fatalf("HandleProcesses (pub A): %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, attendu 1 après événement tenant A", calls.Load())
	}
}

// ─── Fanout notifications MEDIA_ARTICLE_PUBLISHED (newsletter worker) ───────

// seedMediaFanout crée une publication MEDIA + auteur + 2 lecteurs abonnés
// (l'un des deux est l'auteur → exclu du fanout) + 1 lecteur sans follow.
func seedMediaFanout(t *testing.T) (pubID, authorID string) {
	t.Helper()
	// Vide les tables utiles au fanout (IDs fixes, seed rejouable).
	if _, err := poolTest.Exec(context.Background(), `TRUNCATE TABLE
		"Notification", "Follows", "NotificationPreference", "User", "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate fanout: %v", err)
	}

	pubID = "pub_media_fanout"
	authorID = "00000000-0000-0000-0000-000000000030"
	readerA := "00000000-0000-0000-0000-000000000031"
	readerB := "00000000-0000-0000-0000-000000000032"

	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'MEDIA', 'Média Fanout', 'media-fanout', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	users := []struct{ id, email string }{
		{authorID, "author-fanout@test.dev"},
		{readerA, "reader-a@test.dev"},
		{readerB, "reader-b@test.dev"},
	}
	for _, u := range users {
		if _, err := poolTest.Exec(context.Background(),
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`, u.id, u.email, u.email); err != nil {
			t.Fatalf("user %s: %v", u.email, err)
		}
	}
	// readerA suit la publication ; readerB est l'auteur (exclu).
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, now()),
		        (gen_random_uuid()::text, $3, $2, now())`,
		readerA, pubID, authorID); err != nil {
		t.Fatalf("follows: %v", err)
	}
	// L'article existe (FK Notification.articleId → Article).
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId",
		                        "createdAt", "updatedAt")
		 VALUES ('art_fanout_1', 'Article média', 'article-media', '<p>x</p>', true,
		         'PUBLIC', 3, 'PUBLISHED', $1, $2, now(), now())`,
		pubID, authorID); err != nil {
		t.Fatalf("article: %v", err)
	}
	return pubID, authorID
}

func mediaFanoutTask(t *testing.T, pubID, authorID string) *asynq.Task {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{
		"publicationId": pubID,
		"articleId":     "art_fanout_1",
		"authorId":      authorID,
		"title":         "Article média",
		"visibility":    "PUBLIC",
	})
	return asynq.NewTask("article.published", payload)
}

func TestNewsletter_MediaFanout_CreatesNotificationsDeduped(t *testing.T) {
	pubID, authorID := seedMediaFanout(t)
	worker := NewNewsletterWorker(poolTest)

	if err := worker.HandleArticlePublished(context.Background(), mediaFanoutTask(t, pubID, authorID)); err != nil {
		t.Fatalf("HandleArticlePublished (1): %v", err)
	}
	// Rejouer le même événement → la dédup (recipient, sender, type, article,
	// non-lue) doit empêcher les doublons.
	if err := worker.HandleArticlePublished(context.Background(), mediaFanoutTask(t, pubID, authorID)); err != nil {
		t.Fatalf("HandleArticlePublished (2): %v", err)
	}

	var count int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Notification"
		 WHERE type = 'MEDIA_ARTICLE_PUBLISHED' AND "articleId" = 'art_fanout_1' AND "publicationId" = $1`,
		pubID).Scan(&count); err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	if count != 1 {
		t.Fatalf("notifications = %d, attendu 1 (1 follower non-auteur, dédup après rejeu)", count)
	}

	// La notification doit viser le lecteur, pas l'auteur.
	var recipient string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "recipientId" FROM "Notification" WHERE type = 'MEDIA_ARTICLE_PUBLISHED'`).Scan(&recipient); err != nil {
		t.Fatalf("recipient: %v", err)
	}
	if recipient == authorID {
		t.Fatalf("recipient = auteur (%s), attendu le lecteur (pas d'auto-notification)", authorID)
	}
}

func TestNewsletter_PersonalPublication_NoFanoutNotifications(t *testing.T) {
	fx, err := testutil.SeedWebhooks(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Le seed crée une publication PERSONAL → le fanout MEDIA doit être no-op.
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		 VALUES (gen_random_uuid()::text, $1, $2, now())`, fx.EditorID, fx.PublicationID); err != nil {
		t.Fatalf("follow: %v", err)
	}

	worker := NewNewsletterWorker(poolTest)
	if err := worker.HandleArticlePublished(context.Background(), mediaFanoutTask(t, fx.PublicationID, fx.OwnerID)); err != nil {
		t.Fatalf("HandleArticlePublished: %v", err)
	}

	var count int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Notification" WHERE type = 'MEDIA_ARTICLE_PUBLISHED'`).Scan(&count); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("notifications = %d, attendu 0 (publication PERSONAL hors fanout média)", count)
	}
}
