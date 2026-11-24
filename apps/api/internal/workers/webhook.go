// Package workers — handlers de tâches asynq (webhooks, newsletter).
package workers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/webhooks"
	"github.com/qoefi/api/internal/netguard"
	"github.com/qoefi/api/internal/notifications"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/queue"
)

const (
	// defaultWebhookDisableThreshold fixe le nombre d'échecs consécutifs avant
	// désactivation automatique d'un webhook et notification du propriétaire.
	defaultWebhookDisableThreshold = 10
	webhookDeliverMaxRetry         = 5
)

type webhookOutcomeStore interface {
	IsActive(ctx context.Context, webhookID string) (bool, error)
	ResetFailures(ctx context.Context, webhookID string) error
	RecordFailure(ctx context.Context, webhookID string, threshold int, reason string) (name, publisherID string, failures int, autoDisabled bool, err error)
	PublisherOwner(ctx context.Context, publisherID string) (string, error)
	NotifyDisabled(ctx context.Context, ownerID, publisherID, webhookID, name string, failures int) error
}

type pgWebhookOutcomeStore struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func (s *pgWebhookOutcomeStore) IsActive(ctx context.Context, webhookID string) (bool, error) {
	var active bool
	err := s.pool.QueryRow(ctx, `SELECT active FROM "Webhook" WHERE id = $1`, webhookID).Scan(&active)
	return active, err
}

func (s *pgWebhookOutcomeStore) ResetFailures(ctx context.Context, webhookID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE "Webhook"
		SET "consecutiveFailures" = 0,
		    "disabledReason" = NULL,
		    "disabledAt" = NULL,
		    "updatedAt" = now()
		WHERE id = $1
		  AND ("consecutiveFailures" > 0 OR "disabledReason" IS NOT NULL OR "disabledAt" IS NOT NULL)
	`, webhookID)
	return err
}

func (s *pgWebhookOutcomeStore) RecordFailure(ctx context.Context, webhookID string, threshold int, reason string) (string, string, int, bool, error) {
	var (
		name         string
		publisherID  string
		failures     int
		autoDisabled bool
	)
	err := s.pool.QueryRow(ctx, `
		UPDATE "Webhook"
		SET "consecutiveFailures" = "consecutiveFailures" + 1,
		    active = CASE WHEN "consecutiveFailures" + 1 >= $2 THEN false ELSE active END,
		    "disabledReason" = CASE WHEN "consecutiveFailures" + 1 >= $2 THEN $3 ELSE "disabledReason" END,
		    "disabledAt" = CASE WHEN "consecutiveFailures" + 1 >= $2 THEN COALESCE("disabledAt", now()) ELSE "disabledAt" END,
		    "updatedAt" = now()
		WHERE id = $1 AND active = true
		RETURNING name, "publisherId", "consecutiveFailures", ("consecutiveFailures" >= $2)
	`, webhookID, threshold, reason).Scan(&name, &publisherID, &failures, &autoDisabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", 0, false, nil
	}
	return name, publisherID, failures, autoDisabled, err
}

func (s *pgWebhookOutcomeStore) PublisherOwner(ctx context.Context, publisherID string) (string, error) {
	return s.q.GetPublisherOwner(ctx, publisherID)
}

func (s *pgWebhookOutcomeStore) NotifyDisabled(ctx context.Context, ownerID, publisherID, webhookID, name string, failures int) error {
	return notifications.Dispatch(ctx, s.pool, notifications.DispatchInput{
		RecipientID:       ownerID,
		SenderID:          ownerID,
		Type:              "SYSTEM_ALERT",
		AllowSelf:         true,
		BypassPreferences: true,
		PublisherID:       &publisherID,
		Metadata: map[string]any{
			"kind":                "WEBHOOK_DISABLED",
			"webhookId":           webhookID,
			"webhookName":         name,
			"consecutiveFailures": failures,
		},
	})
}

// WebhookWorker dispatche les événements de domaine vers les webhooks HMAC-signés.
type WebhookWorker struct {
	pool             *pgxpool.Pool
	q                *db.Queries
	ac               *asynq.Client
	httpClient       *http.Client
	validateURL      func(string) error
	disableThreshold int
	outcomeDB        webhookOutcomeStore
}

func NewWebhookWorker(pool *pgxpool.Pool) *WebhookWorker {
	return &WebhookWorker{
		pool:             pool,
		q:                db.New(pool),
		disableThreshold: defaultWebhookDisableThreshold,
	}
}

// SetAsynqClient active le fan-out par livraison unitaire (TaskWebhookDeliver).
func (w *WebhookWorker) SetAsynqClient(c *asynq.Client) { w.ac = c }

// SetDisableThreshold ajuste le seuil d'échecs consécutifs (tests).
func (w *WebhookWorker) SetDisableThreshold(n int) {
	if n > 0 {
		w.disableThreshold = n
	}
}

func (w *WebhookWorker) threshold() int {
	if w.disableThreshold <= 0 {
		return defaultWebhookDisableThreshold
	}
	return w.disableThreshold
}

func (w *WebhookWorker) store() webhookOutcomeStore {
	if w.outcomeDB != nil {
		return w.outcomeDB
	}
	if w.pool == nil {
		return nil
	}
	return &pgWebhookOutcomeStore{pool: w.pool, q: w.q}
}

func (w *WebhookWorker) client() *http.Client {
	if w.httpClient != nil {
		return w.httpClient
	}
	return netguard.SafeHTTPClient(10 * time.Second)
}

// WithTestHTTPClient remplace le client ET le validateur d'URL. Réservé aux
// tests : ils visent un serveur httptest sur loopback, que le garde-fou
// anti-SSRF refuse par construction. En production le client et le validateur
// restent indissociables (WithTestHTTPClient n'est jamais appelé).
func (w *WebhookWorker) WithTestHTTPClient(client *http.Client, validate func(string) error) *WebhookWorker {
	w.httpClient = client
	w.validateURL = validate
	return w
}

func (w *WebhookWorker) validate(rawURL string) error {
	if w.validateURL != nil {
		return w.validateURL(rawURL)
	}
	return netguard.ValidateExternalURL(rawURL)
}

// HandleProcesses l'événement et dispatche vers les webhooks abonnés.
// Quand un client asynq est configuré, chaque webhook abonné reçoit sa propre
// tâche TaskWebhookDeliver (retries et backoff indépendants) ; sinon le dispatch
// s'exécute directement (utile aux tests synchrones).
func (w *WebhookWorker) HandleProcesses(ctx context.Context, t *asynq.Task, event string) error {
	var payload map[string]any
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return err
	}
	publisherID, _ := payload["publisherId"].(string)
	if publisherID == "" {
		return nil
	}

	whs, err := w.q.GetActiveWebhooksByPublisher(ctx, db.GetActiveWebhooksByPublisherParams{
		PublisherId: publisherID, Column2: event,
	})
	if err != nil {
		return err
	}
	if len(whs) == 0 {
		return nil
	}

	if w.ac != nil {
		eventID, _ := payload["eventId"].(string)
		for _, wh := range whs {
			if err := w.enqueueDeliver(wh.ID, publisherID, wh.Url, wh.Secret, event, eventID, payload); err != nil {
				log.Printf("[webhook] enqueue deliver %s (%s): %v", event, wh.ID, err)
			}
		}
		return nil
	}

	for _, wh := range whs {
		if dispatchErr := w.dispatch(ctx, wh.ID, wh.Url, wh.Secret, event, payload); dispatchErr != nil {
			log.Printf("[webhook] échec dispatch %s -> %s: %v", event, wh.Url, dispatchErr)
		}
	}
	return nil
}

func (w *WebhookWorker) enqueueDeliver(webhookID, publisherID, targetURL, secret, event, eventID string, payload map[string]any) error {
	raw, err := json.Marshal(queue.WebhookDeliverPayload{
		WebhookID:   webhookID,
		PublisherID: publisherID,
		URL:         targetURL,
		Secret:      secret,
		Event:       event,
		EventID:     eventID,
		Payload:     payload,
	})
	if err != nil {
		return err
	}
	opts := []asynq.Option{asynq.MaxRetry(webhookDeliverMaxRetry), asynq.Queue("default")}
	if eventID != "" {
		opts = append(opts, asynq.TaskID(fmt.Sprintf("wh_%s_%s_%s", webhookID, event, eventID)))
	}
	_, err = w.ac.Enqueue(asynq.NewTask(queue.TaskWebhookDeliver, raw, opts...))
	if errors.Is(err, asynq.ErrDuplicateTask) || errors.Is(err, asynq.ErrTaskIDConflict) {
		return nil
	}
	return err
}

// HandleDeliver exécute une livraison unitaire TaskWebhookDeliver.
func (w *WebhookWorker) HandleDeliver(ctx context.Context, t *asynq.Task) error {
	var p queue.WebhookDeliverPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.WebhookID == "" || p.URL == "" {
		return nil
	}
	if st := w.store(); st != nil {
		active, err := st.IsActive(ctx, p.WebhookID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
			return nil
		}
		if err != nil {
			return err
		}
	}
	return w.dispatch(ctx, p.WebhookID, p.URL, p.Secret, p.Event, p.Payload)
}

func (w *WebhookWorker) dispatch(ctx context.Context, webhookID, url, secret, event string, payload map[string]any) error {
	raw, _ := json.Marshal(payload)
	var deliveryID string
	if w.q != nil && w.pool != nil {
		var err error
		deliveryID, err = w.q.CreateWebhookDelivery(ctx, db.CreateWebhookDeliveryParams{
			WebhookId: webhookID, Event: event, Payload: raw,
		})
		if err != nil {
			return err
		}
	}

	if err := w.validate(url); err != nil {
		return w.failDelivery(ctx, webhookID, event, deliveryID, err)
	}

	body := map[string]any{"event": event, "data": payload, "timestamp": time.Now().UTC().Format(time.RFC3339)}
	bodyBytes, _ := json.Marshal(body)
	sig := webhooks.Signature(secret, bodyBytes)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return w.failDelivery(ctx, webhookID, event, deliveryID, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Qoe-Signature", "sha256="+sig)
	req.Header.Set("X-Qoe-Event", event)
	req.Header.Set("User-Agent", "qoe-fi-webhook/1.0")

	resp, err := w.client().Do(req)
	if err != nil {
		return w.failDelivery(ctx, webhookID, event, deliveryID, err)
	}
	defer resp.Body.Close()

	respBytes := make([]byte, 0, 2048)
	buf := make([]byte, 2048)
	for {
		n, readErr := resp.Body.Read(buf)
		respBytes = append(respBytes, buf[:n]...)
		if n == 0 || len(respBytes) >= 2000 || readErr != nil {
			break
		}
	}
	httpStatus := int32(resp.StatusCode)
	bodyStr := webhooks.TruncateUTF8(string(respBytes), 2000)

	status := "SUCCESS"
	if resp.StatusCode >= 400 {
		status = "FAILED"
	}

	if w.q != nil && deliveryID != "" {
		if err := w.q.UpdateWebhookDelivery(ctx, db.UpdateWebhookDeliveryParams{
			ID:           deliveryID,
			Status:       status,
			HttpStatus:   pgtype.Int4{Int32: httpStatus, Valid: true},
			ResponseBody: pgtype.Text{String: bodyStr, Valid: true},
		}); err != nil {
			return err
		}
	}

	return w.recordOutcome(ctx, webhookID, event, status == "SUCCESS", fmt.Sprintf("HTTP %d", resp.StatusCode))
}

func (w *WebhookWorker) failDelivery(ctx context.Context, webhookID, event, deliveryID string, err error) error {
	msg := webhooks.TruncateUTF8(err.Error(), 2000)
	if w.q != nil && deliveryID != "" {
		_ = w.q.UpdateWebhookDelivery(ctx, db.UpdateWebhookDeliveryParams{
			ID: deliveryID, Status: "FAILED", HttpStatus: pgtype.Int4{}, ResponseBody: pgtype.Text{String: msg, Valid: true},
		})
	}
	_ = w.recordOutcome(ctx, webhookID, event, false, msg)
	return err
}

func (w *WebhookWorker) recordOutcome(ctx context.Context, webhookID, event string, ok bool, reason string) error {
	if ok {
		observability.Default().IncWebhookDelivery(event, "success")
		if st := w.store(); st != nil {
			if err := st.ResetFailures(ctx, webhookID); err != nil {
				log.Printf("[webhook] reset failures (%s): %v", webhookID, err)
			}
		}
		return nil
	}

	observability.Default().IncWebhookDelivery(event, "failed")
	if st := w.store(); st != nil {
		name, pubID, failures, autoDisabled, err := st.RecordFailure(ctx, webhookID, w.threshold(), webhooks.TruncateUTF8(reason, 200))
		if err != nil {
			log.Printf("[webhook] record failure (%s): %v", webhookID, err)
		} else if autoDisabled && pubID != "" {
			if ownerID, ownerErr := st.PublisherOwner(ctx, pubID); ownerErr == nil && ownerID != "" {
				if notifyErr := st.NotifyDisabled(ctx, ownerID, pubID, webhookID, name, failures); notifyErr != nil {
					log.Printf("[webhook] notify disabled (%s): %v", webhookID, notifyErr)
				}
			}
		}
	}
	return fmt.Errorf("webhook delivery failed: %s", reason)
}
