-- name: GetActiveWebhooksByPublication :many
SELECT id, url, secret
FROM "Webhook"
WHERE "publicationId" = $1
  AND active = true
  AND $2::text = ANY(events);

-- name: CreateWebhookDelivery :one
INSERT INTO "WebhookDelivery" (id, "webhookId", event, payload, status)
VALUES (gen_random_uuid()::text, $1, $2, $3, 'PENDING')
RETURNING id;

-- name: UpdateWebhookDelivery :exec
UPDATE "WebhookDelivery"
SET status = $2, "httpStatus" = $3, "responseBody" = $4, attempts = attempts + 1
WHERE id = $1;

-- name: GetActiveSubscribersByPublication :many
SELECT id, email, "isPremium", "tierId"
FROM "Subscriber"
WHERE "publicationId" = $1 AND "isActive" = true
ORDER BY id ASC
LIMIT $2 OFFSET $3;
