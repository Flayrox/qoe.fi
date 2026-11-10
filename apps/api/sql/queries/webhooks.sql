-- name: GetActiveWebhooksByPublisher :many
SELECT id, url, secret
FROM "Webhook"
WHERE "publisherId" = $1
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

-- name: GetActiveSubscribersByPublisher :many
SELECT id, email, "isPremium", "tierId"
FROM "Subscriber"
WHERE "publisherId" = $1 AND "isActive" = true
ORDER BY id ASC
LIMIT $2 OFFSET $3;

-- name: ListWebhooksByPublisher :many
SELECT id, name, url, events, active, "createdAt", "updatedAt"
FROM "Webhook"
WHERE "publisherId" = $1
ORDER BY "createdAt" DESC;

-- name: ListWebhookDeliveries :many
SELECT d.id, d.event, d.status, d."httpStatus", d."responseBody", d.attempts, d."createdAt"
FROM "WebhookDelivery" d
WHERE d."webhookId" = $1
ORDER BY d."createdAt" DESC
LIMIT $2;

-- name: CreateWebhook :one
INSERT INTO "Webhook" (id, "publisherId", name, url, secret, events, active, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(), now())
RETURNING id, name, url, events, active, "createdAt";

-- name: GetWebhook :one
SELECT id, "publisherId", name, url, secret, events, active, "createdAt", "updatedAt"
FROM "Webhook"
WHERE id = $1;

-- name: DeleteWebhook :exec
DELETE FROM "Webhook"
WHERE id = $1;

-- name: UpdateWebhookActive :exec
UPDATE "Webhook"
SET active = $2, "updatedAt" = now()
WHERE id = $1;

-- name: InsertWebhookDeliveryResult :exec
INSERT INTO "WebhookDelivery" (id, "webhookId", event, payload, status, "httpStatus", "responseBody")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6);
