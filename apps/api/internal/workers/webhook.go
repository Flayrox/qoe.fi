// Package workers — handlers de tâches asynq (webhooks, newsletter).
package workers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// WebhookWorker dispatche les événements de domaine vers les webhooks HMAC-signés.
type WebhookWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewWebhookWorker(pool *pgxpool.Pool) *WebhookWorker {
	return &WebhookWorker{pool: pool, q: db.New(pool)}
}

// HandleProcesses l'événement et dispatche vers les webhooks abonnés.
func (w *WebhookWorker) HandleProcesses(ctx context.Context, t *asynq.Task, event string) error {
	var payload map[string]any
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return err
	}
	publicationID, _ := payload["publicationId"].(string)
	if publicationID == "" {
		return nil
	}

	webhooks, err := w.q.GetActiveWebhooksByPublication(ctx, db.GetActiveWebhooksByPublicationParams{
		PublicationId: publicationID, Column2: event,
	})
	if err != nil {
		return err
	}
	if len(webhooks) == 0 {
		return nil
	}

	for _, wh := range webhooks {
		dispatchErr := w.dispatch(ctx, wh.ID, wh.Url, wh.Secret, event, payload)
		if dispatchErr != nil {
			log.Printf("[webhook] échec dispatch %s -> %s: %v", event, wh.Url, dispatchErr)
		}
	}
	return nil
}

func (w *WebhookWorker) dispatch(ctx context.Context, webhookID, url, secret, event string, payload map[string]any) error {
	raw, _ := json.Marshal(payload)
	deliveryID, err := w.q.CreateWebhookDelivery(ctx, db.CreateWebhookDeliveryParams{
		WebhookId: webhookID, Event: event, Payload: raw,
	})
	if err != nil {
		return err
	}

	body := map[string]any{"event": event, "data": payload, "timestamp": time.Now().UTC().Format(time.RFC3339)}
	bodyBytes, _ := json.Marshal(body)
	sig := signHMAC(secret, bodyBytes)

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(bodyBytes)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Qoe-Signature", "sha256="+sig)
	req.Header.Set("X-Qoe-Event", event)
	req.Header.Set("User-Agent", "qoe-fi-webhook/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		msg := err.Error()
		if len(msg) > 2000 {
			msg = msg[:2000]
		}
		_ = w.q.UpdateWebhookDelivery(ctx, db.UpdateWebhookDeliveryParams{
			ID: deliveryID, Status: "FAILED", HttpStatus: pgtype.Int4{}, ResponseBody: pgtype.Text{String: msg, Valid: true},
		})
		return err
	}
	defer resp.Body.Close()

	status := "SUCCESS"
	if resp.StatusCode >= 400 {
		status = "FAILED"
	}
	respBytes := make([]byte, 0, 2048)
	buf := make([]byte, 2048)
	for {
		n, err := resp.Body.Read(buf)
		respBytes = append(respBytes, buf[:n]...)
		if n == 0 || len(respBytes) >= 2000 {
			break
		}
		if err != nil {
			break
		}
	}
	httpStatus := int32(resp.StatusCode)
	bodyStr := string(respBytes)
	if len(bodyStr) > 2000 {
		bodyStr = bodyStr[:2000]
	}

	return w.q.UpdateWebhookDelivery(ctx, db.UpdateWebhookDeliveryParams{
		ID: deliveryID, Status: status, HttpStatus: pgtype.Int4{Int32: httpStatus, Valid: true}, ResponseBody: pgtype.Text{String: bodyStr, Valid: true},
	})
}

func signHMAC(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
