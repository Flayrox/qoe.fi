-- name: ListWebhooksByPublication :many
SELECT id, name, url, events, active, "createdAt", "updatedAt"
FROM "Webhook"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC;

-- name: GetWebhookByID :one
SELECT id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt"
FROM "Webhook"
WHERE id = $1;

-- name: CreateWebhook :one
INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active)
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, true)
RETURNING id;

-- name: DeleteWebhook :exec
DELETE FROM "Webhook"
WHERE id = $1 AND "publicationId" = $2;

-- name: ListWebhookDeliveries :many
SELECT d.id, d.event, d.status, d."httpStatus", d."responseBody", d.attempts, d."createdAt"
FROM "WebhookDelivery" d
WHERE d."webhookId" = $1
ORDER BY d."createdAt" DESC
LIMIT $2;

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
