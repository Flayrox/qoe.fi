-- API Créateur (migration depuis Hono apps/api) : clés API, catégories, users, follows, bookmarks.

-- name: GetApiKeyByHash :one
SELECT ak.id            AS api_key_id,
       ak."keyHash"     AS key_hash,
       ak.scopes        AS scopes,
       u.id::text       AS user_id,
       u.email,
       u.username,
       u.name,
       u."logoUrl"      AS logo_url,
       u."isCertified"  AS is_certified,
       u.role,
       u."apiAccessStatus" AS api_access_status,
       COALESCE(p.id::text, '')::text AS publication_id,
       p."umamiWebsiteId" AS umami_website_id
FROM "ApiKey" ak
JOIN "User" u ON u.id = ak."userId"
LEFT JOIN "Publication" p ON p.id = u."publicationId" AND p.type = 'PERSONAL'
WHERE ak."keyHash" = $1
LIMIT 1;

-- name: UpdateApiKeyLastUsed :exec
UPDATE "ApiKey"
SET "lastUsedAt" = now()
WHERE id = $1;

-- name: ListCategoriesByPublication :many
SELECT c.id,
       c.name,
       c.slug,
       c.description,
       (SELECT COUNT(*)::int
        FROM "Article" a
        WHERE a."categoryId" = c.id AND a."published" = true) AS articles_count
FROM "Category" c
WHERE c."publicationId" = $1
ORDER BY c.name ASC;

-- name: GetPublicationBySlugOrSubdomain :one
SELECT p.id,
       p.type,
       p.name,
       p.slug,
       p.subdomain,
       p."customDomain",
       p."heroText",
       p."logoUrl",
       p."headerImageUrl",
       p."isCertified",
       p."createdAt",
       (SELECT COUNT(*)::int FROM "Follows" f WHERE f."publicationId" = p.id) AS followers_count,
       (SELECT COUNT(*)::int FROM "Article" a WHERE a."publicationId" = p.id AND a."published" = true) AS articles_count
FROM "Publication" p
WHERE p.slug = $1 OR p.subdomain = $1
LIMIT 1;

-- name: GetUserByIDFull :one
SELECT u.id::text        AS user_id,
       u.email,
       u.username,
       u.name,
       u.role,
       u."isCertified",
       u."isShadowbanned",
       u."isSuspended",
       u."suspendReason",
       u."forceStandardTheme",
       u."onboardingText",
       u."logoUrl",
       u."publicationId",
       u."advancedSettingsMode",
       u."hasCompletedOnboarding",
       u."apiAccessStatus",
       u."apiApplicationReason",
       u."walletBalanceCents",
       u."createdAt",
       u."updatedAt"
FROM "User" u
WHERE u.id = $1;

-- name: CountFollowing :one
SELECT COUNT(*)::int AS count
FROM "Follows"
WHERE "readerId" = $1;

-- name: CountFollowers :one
SELECT COUNT(*)::int AS count
FROM "Follows"
WHERE "publicationId" = $1;

-- name: GetExistingFollow :one
SELECT 1 AS present
FROM "Follows"
WHERE "readerId" = $1 AND "publicationId" = $2;

-- name: InsertFollow :exec
INSERT INTO "Follows" (id, "readerId", "publicationId")
VALUES (gen_random_uuid()::text, $1, $2);

-- name: DeleteFollow :exec
DELETE FROM "Follows"
WHERE "readerId" = $1 AND "publicationId" = $2;

-- name: GetExistingBookmark :one
SELECT 1 AS present
FROM "Bookmark"
WHERE "readerId" = $1 AND "articleId" = $2;

-- name: InsertBookmark :exec
INSERT INTO "Bookmark" (id, "readerId", "articleId")
VALUES (gen_random_uuid()::text, $1, $2);

-- name: DeleteBookmark :exec
DELETE FROM "Bookmark"
WHERE "readerId" = $1 AND "articleId" = $2;
