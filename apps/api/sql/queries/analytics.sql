-- name: GetPremiumActiveSubscribers :many
SELECT s."ltvCents", t."monthlyPriceCents"
FROM "Subscriber" s
LEFT JOIN "Tier" t ON t.id = s."tierId"
WHERE s."publicationId" = $1 AND s.status = 'ACTIVE' AND s."isPremium" = true;

-- name: GetFreeSubscriberCount :one
SELECT COUNT(*)::int AS count
FROM "Subscriber"
WHERE "publicationId" = $1 AND "isPremium" = false;

-- name: GetAudienceSummary :one
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
  COUNT(*) FILTER (WHERE "isPremium" = true)::int AS premium
FROM "Subscriber"
WHERE "publicationId" = $1;

-- name: ListSubscribers :many
SELECT id, email, "isActive", "isPremium", "ltvCents", "createdAt"
FROM "Subscriber"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC;

-- name: GetRecentArticlesForAnalytics :many
SELECT id, title, "createdAt"
FROM "Article"
WHERE "publicationId" = $1 AND published = true
ORDER BY "createdAt" DESC
LIMIT $2;

-- name: GetRecentThoughtsForAnalytics :many
SELECT id, content, "createdAt", "likeCount", "repostCount"
FROM "Post"
WHERE "authorId" = $1 AND "isDraft" = false AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT $2;
