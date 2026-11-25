-- Journal des événements de sécurité & Quarantaine API (migration 00090)

-- name: InsertSecurityEvent :one
INSERT INTO "SecurityEvent" ("userId", "publisherId", "apiKeyId", "eventType", "ipSubnet", "userAgent", metadata)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, "createdAt";

-- name: ListUserSecurityEvents :many
SELECT id, "userId", "publisherId", "apiKeyId", "eventType", "ipSubnet", "userAgent", metadata, "createdAt"
FROM "SecurityEvent"
WHERE "userId" = $1
ORDER BY "createdAt" DESC, id DESC
LIMIT 50;

-- name: HasRecentUserLoginEnv :one
SELECT EXISTS(
    SELECT 1 FROM "SecurityEvent"
    WHERE "userId" = $1
      AND "ipSubnet" = $2
      AND "userAgent" = $3
      AND "eventType" IN ('LOGIN_NEW_DEVICE', 'LOGIN_SEEN')
      AND "createdAt" >= now() - INTERVAL '30 days'
)::boolean AS seen;

-- name: QuarantineApiKey :exec
UPDATE "ApiKey"
SET status = 'READ_ONLY',
    "suspendedAt" = COALESCE("suspendedAt", now()),
    "suspendReason" = $2
WHERE id = $1 AND status <> 'REVOKED';

-- name: UnquarantineApiKey :exec
UPDATE "ApiKey"
SET status = 'ACTIVE',
    "suspendedAt" = NULL,
    "suspendReason" = NULL
WHERE id = $1 AND status = 'READ_ONLY';

-- name: QuarantinePublisherAPI :exec
UPDATE "Publisher"
SET "apiReadOnlyAt" = COALESCE("apiReadOnlyAt", now()),
    "apiReadOnlyReason" = $2
WHERE id = $1;

-- name: UnquarantinePublisherAPI :exec
UPDATE "Publisher"
SET "apiReadOnlyAt" = NULL,
    "apiReadOnlyReason" = NULL
WHERE id = $1;
