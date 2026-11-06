package admin

// =====================================================================
// 📮 outbox.go — Observabilité et reprise de la boîte d'envoi (Lot D5)
// =====================================================================
// Fournit la supervision fine de la boîte d'envoi asynchrone :
//   - Profondeur par statut (QUEUED, PROCESSING, FAILED, SENT)
//   - Décomposition par canal (EMAIL, PUSH, IN_APP)
//   - Détection des blocages : messages coincés en PROCESSING (> 10m)
//   - Âge du message le plus ancien en attente (lag de dépilage)
//   - Actions de reprise sécurisées (déblocage fantômes, batch-retry, retry-all)
// =====================================================================

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/qoefi/api/internal/response"
)

type OutboxChannelMetrics struct {
	Channel string `json:"channel"`
	Queued  int64  `json:"queued"`
	Sent    int64  `json:"sent"`
	Failed  int64  `json:"failed"`
}

type OutboxHealthMetrics struct {
	QueuedTotal         int64                  `json:"queuedTotal"`
	ProcessingTotal     int64                  `json:"processingTotal"`
	StuckProcessing     int64                  `json:"stuckProcessing"`
	FailedTotal         int64                  `json:"failedTotal"`
	Sent24h             int64                  `json:"sent24h"`
	Failed24h           int64                  `json:"failed24h"`
	OldestQueuedSeconds int64                  `json:"oldestQueuedSeconds"`
	Channels            []OutboxChannelMetrics `json:"channels"`
	Status              string                 `json:"status"` // "healthy" | "degraded" | "blocked"
}

// GetOutboxMetrics calcule les métriques temps-réel de profondeur et de blocage.
func (s *Service) GetOutboxMetrics(ctx context.Context, staffID string) (*OutboxHealthMetrics, error) {
	metrics := &OutboxHealthMetrics{
		Channels: make([]OutboxChannelMetrics, 0),
		Status:   "healthy",
	}

	if s == nil || s.pool == nil {
		return metrics, nil
	}

	// 1. Totaux globaux, messages coincés et âge du plus ancien
	row := s.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE "status" = 'QUEUED')::bigint,
		    COUNT(*) FILTER (WHERE "status" = 'PROCESSING')::bigint,
		    COUNT(*) FILTER (WHERE "status" = 'PROCESSING' AND "updatedAt" <= CURRENT_TIMESTAMP - interval '10 minutes')::bigint,
		    COUNT(*) FILTER (WHERE "status" IN ('FAILED', 'DISABLED'))::bigint,
		    COUNT(*) FILTER (WHERE "status" = 'SENT' AND "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours')::bigint,
		    COUNT(*) FILTER (WHERE "status" IN ('FAILED', 'DISABLED') AND "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours')::bigint,
		    COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN("createdAt") FILTER (WHERE "status" = 'QUEUED')))::bigint, 0)
		  FROM "NotificationDelivery"`)

	if err := row.Scan(
		&metrics.QueuedTotal,
		&metrics.ProcessingTotal,
		&metrics.StuckProcessing,
		&metrics.FailedTotal,
		&metrics.Sent24h,
		&metrics.Failed24h,
		&metrics.OldestQueuedSeconds,
	); err != nil {
		return metrics, err
	}

	// 2. Décomposition par canal
	cRows, err := s.pool.Query(ctx, `
		SELECT
		    "channel",
		    COUNT(*) FILTER (WHERE "status" = 'QUEUED')::bigint,
		    COUNT(*) FILTER (WHERE "status" = 'SENT' AND "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours')::bigint,
		    COUNT(*) FILTER (WHERE "status" IN ('FAILED', 'DISABLED'))::bigint
		  FROM "NotificationDelivery"
		 GROUP BY "channel"
		 ORDER BY "channel"`)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var ch OutboxChannelMetrics
			if err := cRows.Scan(&ch.Channel, &ch.Queued, &ch.Sent, &ch.Failed); err == nil {
				metrics.Channels = append(metrics.Channels, ch)
			}
		}
	}

	// 3. Statut qualifié
	if metrics.StuckProcessing > 0 || metrics.OldestQueuedSeconds > 900 || metrics.FailedTotal > 50 {
		metrics.Status = "blocked"
	} else if metrics.OldestQueuedSeconds > 180 || metrics.FailedTotal > 10 || metrics.QueuedTotal > 100 {
		metrics.Status = "degraded"
	}

	return metrics, nil
}

// RetryAllFailedDeliveries remet en file d'attente toutes les livraisons en échec.
func (s *Service) RetryAllFailedDeliveries(ctx context.Context, staffID, reason, channel string) (int64, error) {
	if s == nil || s.pool == nil {
		return 0, nil
	}

	query := `
		UPDATE "NotificationDelivery"
		   SET "status" = 'QUEUED', "availableAt" = CURRENT_TIMESTAMP, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
		 WHERE "status" IN ('FAILED', 'DISABLED')`
	args := []any{}

	if channel != "" {
		query += ` AND "channel" = $1`
		args = append(args, channel)
	}

	res, err := s.pool.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}

	count := res.RowsAffected()

	s.logAudit(ctx, staffID, "deliveries.retry_all", "system", "outbox", map[string]any{
		"retriedCount": count,
		"channel":      channel,
		"reason":       reason,
	})

	return count, nil
}

// UnlockStuckDeliveries débloque les messages restés en PROCESSING suite à un crash de worker.
func (s *Service) UnlockStuckDeliveries(ctx context.Context, staffID, reason string, maxAgeMinutes int) (int64, error) {
	if s == nil || s.pool == nil {
		return 0, nil
	}

	if maxAgeMinutes <= 0 {
		maxAgeMinutes = 10
	}

	query := fmt.Sprintf(`
		UPDATE "NotificationDelivery"
		   SET "status" = 'QUEUED', "availableAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
		 WHERE "status" = 'PROCESSING'
		   AND "updatedAt" <= CURRENT_TIMESTAMP - interval '%d minutes'`, maxAgeMinutes)

	res, err := s.pool.Exec(ctx, query)
	if err != nil {
		return 0, err
	}

	count := res.RowsAffected()

	s.logAudit(ctx, staffID, "deliveries.unlock_stuck", "system", "outbox", map[string]any{
		"unlockedCount": count,
		"maxAgeMinutes": maxAgeMinutes,
		"reason":        reason,
	})

	return count, nil
}

// BatchRetryDeliveries relance une sélection d'identifiants de livraison.
func (s *Service) BatchRetryDeliveries(ctx context.Context, staffID string, ids []string, reason string) (int64, error) {
	if s == nil || s.pool == nil || len(ids) == 0 {
		return 0, nil
	}

	res, err := s.pool.Exec(ctx, `
		UPDATE "NotificationDelivery"
		   SET "status" = 'QUEUED', "availableAt" = CURRENT_TIMESTAMP, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
		 WHERE "id" = ANY($1)
		   AND "status" IN ('FAILED', 'DISABLED')`, ids)
	if err != nil {
		return 0, err
	}

	count := res.RowsAffected()

	s.logAudit(ctx, staffID, "deliveries.batch_retry", "system", "outbox", map[string]any{
		"retriedCount": count,
		"requested":    len(ids),
		"reason":       reason,
	})

	return count, nil
}

// ── HTTP Handlers ──────────────────────────────────────────────────────────

// GET /v1/admin/outbox/metrics
func (h *Handler) outboxMetrics(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	metrics, err := h.svc.GetOutboxMetrics(r.Context(), staffID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, metrics)
}

type RetryAllInput struct {
	Reason  string `json:"reason"`
	Channel string `json:"channel,omitempty"`
}

// POST /v1/admin/outbox/retry-all
func (h *Handler) retryAllFailed(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in RetryAllInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	count, err := h.svc.RetryAllFailedDeliveries(r.Context(), staffID, in.Reason, in.Channel)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "retriedCount": count})
}

type UnlockStuckInput struct {
	Reason        string `json:"reason"`
	MaxAgeMinutes int    `json:"maxAgeMinutes,omitempty"`
}

// POST /v1/admin/outbox/unlock-stuck
func (h *Handler) unlockStuck(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in UnlockStuckInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	count, err := h.svc.UnlockStuckDeliveries(r.Context(), staffID, in.Reason, in.MaxAgeMinutes)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "unlockedCount": count})
}

type BatchRetryInput struct {
	IDs    []string `json:"ids"`
	Reason string   `json:"reason,omitempty"`
}

// POST /v1/admin/outbox/batch-retry
func (h *Handler) batchRetry(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in BatchRetryInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || len(in.IDs) == 0 {
		response.Error(w, http.StatusBadRequest, "Identifiants de livraison requis (ids)")
		return
	}

	count, err := h.svc.BatchRetryDeliveries(r.Context(), staffID, in.IDs, in.Reason)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "retriedCount": count})
}
