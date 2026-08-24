-- Admin — console superadmin (modération & management).
-- Rôle : réservé au superadmin (vérifié côté service/handler).

-- name: GetAdminUserRole :one
SELECT role FROM "User" WHERE id = $1;

-- name: AdminDashboardCounts :one
SELECT
    (SELECT count(*) FROM "User") AS users,
    (SELECT count(*) FROM "User" WHERE role = 'creator') AS creators,
    (SELECT count(*) FROM "Article") AS articles,
    (SELECT count(*) FROM "Subscriber" WHERE "isPremium" = true AND "isActive" = true) AS premium_subscribers;

-- name: ListAdminUsers :many
SELECT u.id, u.name, u.email, u.username, u.role, u."isCertified", u."isShadowbanned",
       u."isSuspended", u."suspendReason", u."createdAt", u."updatedAt",
       p."subdomain" AS publication_subdomain
FROM "User" u
LEFT JOIN "Publication" p ON p.id = u."publicationId"
ORDER BY u."createdAt" DESC;

-- name: GetAdminUser :one
SELECT u.id, u.name, u.email, u.username, u.role, u."isCertified", u."isShadowbanned",
       u."isSuspended", u."suspendReason", u."logoUrl", u."publicationId", u."createdAt",
       p."subdomain", p."name" AS publication_name,
       (SELECT count(*) FROM "Article" a WHERE a."publicationId" = p.id) AS articles_count,
       (SELECT count(*) FROM "Subscriber" s WHERE s."publicationId" = p.id) AS subscribers_count,
       (SELECT count(*) FROM "WalletTransaction" w WHERE w."userId" = u.id) AS wallet_transactions_count
FROM "User" u
LEFT JOIN "Publication" p ON p.id = u."publicationId"
WHERE u.id = $1;

-- name: GetAdminUserRevenue :one
SELECT COALESCE(sum(w."amountCents"), 0)::bigint AS total_cents
FROM "WalletTransaction" w
WHERE w."userId" = $1 AND w."type" = 'SUBSCRIPTION_PAYMENT';

-- name: UpdateAdminUserModeration :one
UPDATE "User"
SET "isCertified" = $2, "isShadowbanned" = $3, "isSuspended" = $4,
    "suspendReason" = $5, "updatedAt" = now()
WHERE id = $1
RETURNING id, role, "isCertified", "isShadowbanned", "isSuspended", "suspendReason";

-- name: UpdatePublicationCertified :one
UPDATE "Publication"
SET "isCertified" = $2, "updatedAt" = now()
WHERE id = $1
RETURNING id, "isCertified";

-- ── Widgets & Tendances ──────────────────────────────────────────────────────

-- name: ListAdminArticles :many
SELECT a.id, a.title, a.slug, a.published, a."isEditorPick", a."createdAt",
       u.name AS author_name, u.email AS author_email
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
ORDER BY a."createdAt" DESC;

-- name: ListAdminTrends :many
SELECT id, hashtag, count, "createdAt", "updatedAt"
FROM "Trend"
ORDER BY count DESC;

-- name: ListAdminPromos :many
SELECT id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive", "createdAt", "updatedAt"
FROM "PartnerPromo"
ORDER BY "createdAt" DESC;

-- name: SetArticleEditorPick :one
UPDATE "Article" SET "isEditorPick" = $2, "updatedAt" = now() WHERE id = $1 RETURNING id, "isEditorPick";

-- name: ClearArticleEditorPicks :exec
UPDATE "Article" SET "isEditorPick" = false, "updatedAt" = now() WHERE "isEditorPick" = true;

-- name: UpsertTrend :one
INSERT INTO "Trend" (id, hashtag, count, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, now(), now())
ON CONFLICT (hashtag) DO UPDATE SET count = EXCLUDED.count, "updatedAt" = now()
RETURNING id, hashtag, count;

-- name: DeleteTrend :exec
DELETE FROM "Trend" WHERE id = $1;

-- name: UpdateTrendCount :one
UPDATE "Trend" SET count = $2, "updatedAt" = now() WHERE id = $1 RETURNING id, hashtag, count;

-- name: UpsertPromo :one
INSERT INTO "PartnerPromo" (id, title, description, "ctaText", "ctaUrl", "isActive", "createdAt", "updatedAt")
VALUES (COALESCE(NULLIF($1, ''), gen_random_uuid()::text), $2, $3, $4, $5, $6, now(), now())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
    "ctaText" = EXCLUDED."ctaText", "ctaUrl" = EXCLUDED."ctaUrl",
    "isActive" = EXCLUDED."isActive", "updatedAt" = now()
RETURNING id, title, description, "ctaText", "ctaUrl", "imageUrl", "isActive";

-- name: DeletePromo :exec
DELETE FROM "PartnerPromo" WHERE id = $1;

-- name: UpdatePromoActive :one
UPDATE "PartnerPromo" SET "isActive" = $2, "updatedAt" = now() WHERE id = $1
RETURNING id, "isActive";

-- ── Feature Flags / Config / Frontend / Translations ────────────────────────

-- name: ListSystemConfigs :many
SELECT key, value, description, "updatedAt" FROM "SystemConfig" ORDER BY key ASC;

-- name: GetSystemConfigsByKeys :many
SELECT key, value, description, "updatedAt" FROM "SystemConfig" WHERE key = ANY($1::text[]);

-- name: UpsertSystemConfig :one
INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
VALUES ($1, $2, $3, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
    description = COALESCE(EXCLUDED.description, "SystemConfig".description), "updatedAt" = now()
RETURNING key, value, description, "updatedAt";

-- name: DeleteSystemConfig :exec
DELETE FROM "SystemConfig" WHERE key = $1;

-- ── OAuth ────────────────────────────────────────────────────────────────────

-- name: ListAdminOAuthClients :many
SELECT c.id, c."clientId", c.name, c.description, c."logoUrl", c."homepageUrl",
       c."redirectUris", c.scopes, c."clientType", c.status, c."createdAt",
       u.name AS owner_name, u.email AS owner_email, u.username AS owner_username
FROM "OAuthClient" c
JOIN "User" u ON u.id = c."ownerUserId"
ORDER BY c."createdAt" DESC;

-- name: UpdateAdminOAuthClientStatus :one
UPDATE "OAuthClient" SET status = $2, "updatedAt" = now() WHERE id = $1
RETURNING id, status;

-- ── Demandes d'accès API ─────────────────────────────────────────────────────

-- name: ListAdminApiApplicants :many
SELECT u.id, u.name, u.email, u."apiAccessStatus", u."apiApplicationReason", u."createdAt", u."updatedAt",
       p."subdomain" AS publication_subdomain
FROM "User" u
LEFT JOIN "Publication" p ON p.id = u."publicationId"
WHERE u.role IN ('creator', 'superadmin') AND u."apiAccessStatus" <> 'none'
ORDER BY u."updatedAt" DESC;

-- name: UpdateAdminUserApiAccess :one
UPDATE "User" SET "apiAccessStatus" = $2, "updatedAt" = now() WHERE id = $1
RETURNING id, "apiAccessStatus";

-- ── Notifications & livraisons ───────────────────────────────────────────────

-- name: CountNotificationDeliveriesByStatus :many
SELECT status, count(*) AS total
FROM "NotificationDelivery"
GROUP BY status;

-- name: CountAllNotificationDeliveries :one
SELECT count(*) FROM "NotificationDelivery";

-- name: ListNotificationDeliveries :many
SELECT d.id, d.recipient, d.status, d.channel, d.attempts, d.provider, d."lastError", d."createdAt",
       n.type::text AS notification_type, a.title AS article_title
FROM "NotificationDelivery" d
JOIN "Notification" n ON n.id = d."notificationId"
LEFT JOIN "Article" a ON a.id = n."articleId"
ORDER BY d."createdAt" DESC
LIMIT 50;

-- name: RetryNotificationDelivery :exec
UPDATE "NotificationDelivery"
SET status = 'QUEUED', "availableAt" = now(), "lastError" = NULL, "updatedAt" = now()
WHERE id = $1 AND status IN ('FAILED', 'DISABLED');
