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

-- name: ListWebhooksByPublication :many
SELECT id, name, url, events, active, "createdAt"
FROM "Webhook"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC;

-- name: ListWebhookDeliveries :many
SELECT id, status, "httpStatus", event, "createdAt"
FROM "WebhookDelivery"
WHERE "webhookId" = $1
ORDER BY "createdAt" DESC
LIMIT 5;

-- name: CreateWebhook :one
INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(), now())
RETURNING id, name, url, events, active, "createdAt";

-- name: GetWebhook :one
SELECT id, "publicationId", name, url, secret, events, active, "createdAt"
FROM "Webhook"
WHERE id = $1;

-- name: DeleteWebhook :exec
DELETE FROM "Webhook"
WHERE id = $1;

-- name: UpdateWebhookActive :exec
UPDATE "Webhook"
SET active = $2
WHERE id = $1;

-- name: InsertWebhookDeliveryResult :exec
INSERT INTO "WebhookDelivery" (id, "webhookId", event, payload, status, "httpStatus", "responseBody", attempts)
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, 1);
