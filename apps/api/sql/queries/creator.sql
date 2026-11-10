-- API Créateur (migration depuis Hono apps/api) : clés API, catégories, users, follows, bookmarks.

-- name: GetApiKeyByHash :one
SELECT ak.id                                            AS api_key_id,
       ak."keyHash"                                     AS key_hash,
       ak.scopes                                        AS scopes,
       COALESCE(ak."userId"::text, '')::text            AS key_user_id,
       COALESCE(ak."publisherId"::text, '')::text    AS key_publisher_id,
       COALESCE(ak."createdByUserId"::text, '')::text  AS created_by_user_id,
       COALESCE(u.id::text, '')::text                   AS user_id,
       u.email                                          AS user_email,
       u.username                                       AS user_username,
       u.name                                           AS user_name,
       u."logoUrl"                                      AS user_logo_url,
       u."isCertified"                                  AS user_is_certified,
       u.role                                           AS user_role,
       u."apiAccessStatus"                              AS user_api_access_status,
       u."apiGrants"                                    AS user_api_grants,
       COALESCE(p.id::text, '')::text                   AS publisher_id,
       COALESCE(p.type::text, '')::text                 AS publisher_type,
       p."umamiWebsiteId"                               AS umami_website_id,
       COALESCE(md.id::text, '')::text                  AS media_id,
       sc.value                                         AS platform_api_modules
FROM "ApiKey" ak
LEFT JOIN "User" u ON u.id = ak."userId"
LEFT JOIN "Publisher" p ON p.id = COALESCE(ak."publisherId", u."publisherId")
LEFT JOIN "Media" md ON md."publisherId" = p.id
LEFT JOIN "SystemConfig" sc ON sc.key = 'API_ACCESS_MODULES'
WHERE ak."keyHash" = $1
LIMIT 1;

-- name: UpdateApiKeyLastUsed :exec
UPDATE "ApiKey"
SET "lastUsedAt" = now()
WHERE id = $1;

-- name: ListCategoriesByPublisher :many
SELECT c.id,
       c.name,
       c.slug,
       c.description,
       c."parentId",
       c."isDefault",
       (SELECT COUNT(*)::int
        FROM "Article" a
        WHERE a."categoryId" = c.id AND a."published" = true) AS articles_count
FROM "Category" c
WHERE c."publisherId" = $1
ORDER BY c.name ASC;

-- name: GetPublisherBySlugOrSubdomain :one
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
       (SELECT COUNT(*)::int FROM "Follows" f WHERE f."publisherId" = p.id) AS followers_count,
       (SELECT COUNT(*)::int FROM "Article" a WHERE a."publisherId" = p.id AND a."published" = true) AS articles_count
FROM "Publisher" p
LEFT JOIN "User" u ON u."publisherId" = p.id
WHERE LOWER(p.slug) = LOWER($1)
   OR LOWER(COALESCE(p.subdomain, '')) = LOWER($1)
   OR LOWER(COALESCE(u.username, '')) = LOWER($1)
   OR LOWER(p.id) = LOWER($1)
   OR LOWER(COALESCE(u.id::text, '')) = LOWER($1)
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
       u."publisherId",
       u."advancedSettingsMode",
       u."hasCompletedOnboarding",
       u."apiAccessStatus",
       u."apiGrants",
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
WHERE "publisherId" = $1;

-- name: GetExistingFollow :one
SELECT 1 AS present
FROM "Follows"
WHERE "readerId" = $1 AND "publisherId" = $2;

-- name: InsertFollow :exec
INSERT INTO "Follows" (id, "readerId", "publisherId")
VALUES (gen_random_uuid()::text, $1, $2);

-- name: DeleteFollow :exec
DELETE FROM "Follows"
WHERE "readerId" = $1 AND "publisherId" = $2;

-- name: ListFollowersByPublisher :many
-- Abonnés d'une publication (profil), paginés — avec état follow du viewer.
SELECT u.id::text            AS user_id,
       u.name                AS user_name,
       u.username            AS user_username,
       u."logoUrl"           AS user_logo,
       u."isCertified"      AS user_certified,
       u."publisherId"::text AS user_publisher_id,
       f."createdAt"        AS followed_at,
       (vf.id IS NOT NULL)::boolean AS viewer_follows
FROM "Follows" f
JOIN "User" u ON u.id = f."readerId"
LEFT JOIN "Follows" vf ON vf."readerId" = @viewer_id AND vf."publisherId" = u."publisherId"
WHERE f."publisherId" = $1
  AND u."publisherId" IS NOT NULL
ORDER BY f."createdAt" DESC, u.id DESC
LIMIT $2 OFFSET $3;

-- name: ListFollowingByUser :many
-- Abonnements d'un utilisateur (profil), résolus vers les propriétaires des
-- publications suivies (PERSONAL/MEDIA), paginés — avec état follow du viewer.
SELECT COALESCE(owner.id::text, p.id)       AS user_id,
       COALESCE(owner.name, p.name)         AS user_name,
       COALESCE(owner.username, p.slug)     AS user_username,
       COALESCE(owner."logoUrl", p."logoUrl") AS user_logo,
       COALESCE(owner."isCertified", p."isCertified") AS user_certified,
       p.id::text                           AS user_publisher_id,
       f."createdAt"                        AS followed_at,
       (vf.id IS NOT NULL)::boolean         AS viewer_follows
FROM "Follows" f
JOIN "Publisher" p ON p.id = f."publisherId"
LEFT JOIN "User" owner ON owner."publisherId" = p.id
LEFT JOIN "Follows" vf ON vf."readerId" = @viewer_id AND vf."publisherId" = p.id
WHERE f."readerId" = $1
ORDER BY f."createdAt" DESC, f.id DESC
LIMIT $2 OFFSET $3;

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

-- name: ListBookmarksByReader :many
-- Articles sauvegardés (bookmarks) d'un lecteur, avec titre/slug/publication
-- et la date de sauvegarde — pour la bibliothèque mobile.
SELECT b.id                 AS bookmark_id,
       b."createdAt"        AS bookmarked_at,
       a.id                 AS article_id,
       a.title              AS article_title,
       a.slug               AS article_slug,
       a."readingTime"      AS article_reading_time,
       a."isPremium"        AS article_is_premium,
       a."createdAt"        AS article_created_at,
       p.id                 AS publisher_id,
       p.name               AS publisher_name,
       p.slug               AS publisher_slug,
       p.subdomain          AS publisher_subdomain,
       p."customDomain"     AS publisher_custom_domain,
       p."logoUrl"          AS publisher_logo,
       a.content            AS article_content,
       c.name               AS category_name,
       u.id::text           AS author_id,
       u.name               AS author_name,
       u.username           AS author_username,
       u."logoUrl"          AS author_logo
FROM "Bookmark" b
JOIN "Article" a ON a.id = b."articleId" AND a.published = true
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
JOIN "User" u ON u.id = a."authorId"
WHERE b."readerId" = $1
ORDER BY b."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: GetUserPronouns :one
SELECT "pronouns" FROM "User" WHERE id = $1;

-- name: GetUserProfileVisibility :one
-- Visibilité du profil (PUBLIC | FOLLOWERS | PRIVATE). La ligne UserSettings
-- peut manquer (comptes historiques) : PUBLIC par défaut, jamais NULL.
SELECT COALESCE(us."profileVisibility", 'PUBLIC')::text AS profile_visibility
FROM "User" u
LEFT JOIN "UserSettings" us ON us."userId" = u.id
WHERE u.id = $1;

-- name: IsBlockedEitherWay :one
-- Blocage directionnel en base, mais invisible dans les deux sens : si l'un
-- des deux a bloqué l'autre, aucun contenu ne doit circuler.
SELECT EXISTS (
    SELECT 1 FROM "BlockedUser"
    WHERE ("readerId" = $1 AND "creatorId" = $2)
       OR ("readerId" = $2 AND "creatorId" = $1)
) AS blocked;

-- name: GetExistingFollowRequest :one
SELECT 1 AS present
FROM "FollowRequest"
WHERE "requesterId" = $1 AND "publisherId" = $2 AND status = 'PENDING';

-- name: InsertFollowRequest :exec
INSERT INTO "FollowRequest" (id, "requesterId", "publisherId", status)
VALUES (gen_random_uuid()::text, $1, $2, 'PENDING')
ON CONFLICT DO NOTHING;

-- name: DeleteFollowRequest :exec
DELETE FROM "FollowRequest"
WHERE "requesterId" = $1 AND "publisherId" = $2 AND status = 'PENDING';

-- name: CancelFollowRequest :exec
UPDATE "FollowRequest"
SET status = 'CANCELLED', "decidedAt" = now()
WHERE "requesterId" = $1 AND "publisherId" = $2 AND status = 'PENDING';

-- name: AcceptFollowRequest :exec
UPDATE "FollowRequest"
SET status = 'ACCEPTED', "decidedAt" = now()
WHERE id = $1 AND status = 'PENDING';

-- name: RejectFollowRequest :exec
UPDATE "FollowRequest"
SET status = 'REJECTED', "decidedAt" = now()
WHERE id = $1 AND status = 'PENDING';

-- name: GetPendingFollowRequestID :one
SELECT id
FROM "FollowRequest"
WHERE "requesterId" = $1 AND "publisherId" = $2 AND status = 'PENDING'
LIMIT 1;

-- name: InsertFollowRequestNotification :exec
-- Réutilise le type FOLLOW (pas de migration d'enum) : metadata.kind permet
-- à l'UI de distinguer une demande d'un follow accepté, et metadata.requestId
-- permet d'accepter/refuser la demande directement depuis la notification.
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "publisherId", metadata)
VALUES (gen_random_uuid()::text, sqlc.arg('recipient_id'), sqlc.arg('sender_id'), 'FOLLOW', sqlc.arg('publisher_id'),
        jsonb_build_object('kind', 'FOLLOW_REQUEST', 'requestId', sqlc.arg('request_id')::text));

-- name: DeleteFollowRequestNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'FOLLOW' AND "publisherId" = $3
  AND metadata->>'kind' = 'FOLLOW_REQUEST';
