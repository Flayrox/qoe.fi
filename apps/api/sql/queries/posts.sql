-- name: GetUserByID :one
SELECT id, username, name, "logoUrl", "isCertified", "isShadowbanned", "isSuspended", role
FROM "User"
WHERE id = $1;

-- name: GetThoughtByID :one
SELECT p.id,
       p.content,
       p."authorId",
       p."createdAt",
       p."updatedAt",
       p.tags,
       p."imageUrl",
       p."likeCount",
       p."repostCount",
       p."replyCount",
       p."parentId",
       p."rootId",
       p."repostId",
       p."replyRestriction",
       p."isPinned",
       p."isHiddenByAuthor",
       p."isDraft",
       p."scheduledAt",
       p."deletedAt",
       u.id::text   AS author_id,
       u.name       AS author_name,
       u.username   AS author_username,
       u."logoUrl"  AS author_logo,
       u."isCertified" AS author_certified
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p.id = $1
  AND p."deletedAt" IS NULL;

-- name: GetCanonicalThoughtID :one
SELECT COALESCE("repostId", id)::text AS id
FROM "Post"
WHERE id = $1;

-- name: CreateThought :one
INSERT INTO "Post" (id, "content", "authorId", "updatedAt", tags, "imageUrl", visibility, "contentVisibility", "isDraft", "scheduledAt", "triggerWarning", "parentId", "rootId", "repostId", "quotedArticleId", "quotedExcerpt", "replyRestriction", "isPinned", "likeCount", "repostCount", "replyCount")
VALUES (gen_random_uuid()::text, sqlc.arg('content'), sqlc.arg('authorId'), now(), sqlc.arg('tags'), sqlc.arg('imageUrl'), sqlc.arg('visibility'), sqlc.arg('contentVisibility'), sqlc.arg('isDraft'), sqlc.arg('scheduledAt'), sqlc.arg('triggerWarning'), NULLIF(sqlc.arg('parentId'), ''), NULLIF(sqlc.arg('rootId'), ''), NULLIF(sqlc.arg('repostId'), ''), NULLIF(sqlc.arg('quotedArticleId'), ''), NULLIF(sqlc.arg('quotedExcerpt'), ''), sqlc.arg('replyRestriction'), false, 0, 0, 0)
RETURNING id, "content", "authorId", "createdAt", tags, "parentId", "rootId", "repostId", "isDraft", "visibility", "contentVisibility";

-- name: ListUserDrafts :many
SELECT id, content, "imageUrl", visibility, "scheduledAt", "triggerWarning", tags, "updatedAt"
FROM "Post"
WHERE "authorId" = $1
  AND "isDraft" = true
  AND "deletedAt" IS NULL
ORDER BY "updatedAt" DESC
LIMIT $2;

-- name: HidePostByAuthor :one
UPDATE "Post" r
SET "isHiddenByAuthor" = NOT r."isHiddenByAuthor"
FROM "Post" p
WHERE r.id = $1
  AND r."deletedAt" IS NULL
  AND r."parentId" IS NOT NULL
  AND r."parentId" = p.id
  AND p."authorId" = $2
RETURNING r."isHiddenByAuthor";

-- name: InsertLike :one
INSERT INTO "Like" (id, "postId", "userId")
VALUES (gen_random_uuid()::text, $1, $2)
RETURNING id;

-- name: DeleteLike :exec
DELETE FROM "Like"
WHERE "postId" = $1 AND "userId" = $2;

-- name: IncrementLikeCount :exec
UPDATE "Post"
SET "likeCount" = "likeCount" + 1
WHERE id = $1;

-- name: DecrementLikeCount :exec
UPDATE "Post"
SET "likeCount" = GREATEST("likeCount" - 1, 0)
WHERE id = $1;

-- name: IncrementReplyCount :exec
UPDATE "Post"
SET "replyCount" = "replyCount" + 1
WHERE id = $1;

-- name: DecrementReplyCount :exec
UPDATE "Post"
SET "replyCount" = GREATEST("replyCount" - 1, 0)
WHERE id = $1;

-- name: InsertPureRepost :one
INSERT INTO "Post" (id, "content", "authorId", "updatedAt", "repostId", "replyRestriction", "visibility", "contentVisibility", "isDraft", "likeCount", "repostCount", "replyCount")
VALUES (gen_random_uuid()::text, '', $1, now(), $2, 'everyone', 'public', 'PUBLIC', false, 0, 0, 0)
RETURNING id;

-- name: DeletePureReposts :exec
DELETE FROM "Post"
WHERE "authorId" = $1
  AND "repostId" = $2
  AND "deletedAt" IS NULL
  AND (content = '' OR content = ' ');

-- name: IncrementRepostCount :exec
UPDATE "Post"
SET "repostCount" = "repostCount" + 1
WHERE id = $1;

-- name: DecrementRepostCount :exec
UPDATE "Post"
SET "repostCount" = GREATEST("repostCount" - 1, 0)
WHERE id = $1;

-- name: GetExistingLike :one
SELECT 1 AS present
FROM "Like"
WHERE "postId" = $1 AND "userId" = $2;

-- name: CountPureReposts :one
SELECT COUNT(*)::int AS count
FROM "Post"
WHERE "authorId" = $1
  AND "repostId" = $2
  AND "deletedAt" IS NULL
  AND (content = '' OR content = ' ');

-- name: SoftDeletePost :one
UPDATE "Post"
SET "deletedAt" = now()
WHERE id = $1 AND "authorId" = $2 AND "deletedAt" IS NULL
RETURNING id;

-- name: PinPost :one
UPDATE "Post"
SET "isPinned" = true
WHERE id = $1 AND "authorId" = $2 AND "deletedAt" IS NULL
RETURNING "isPinned";

-- name: UnpinPost :one
UPDATE "Post"
SET "isPinned" = false
WHERE id = $1 AND "authorId" = $2
RETURNING "isPinned";

-- name: ClearPinnedPosts :exec
UPDATE "Post"
SET "isPinned" = false
WHERE "authorId" = $1
  AND "isPinned" = true
  AND "deletedAt" IS NULL;

-- name: ListLikesForPost :many
SELECT u.id::text     AS user_id,
       u.name         AS user_name,
       u.username     AS user_username,
       u."logoUrl"    AS user_logo,
       u."isCertified" AS user_certified,
       l."createdAt"  AS liked_at
FROM "Like" l
JOIN "User" u ON u.id = l."userId"
WHERE l."postId" = $1
ORDER BY l."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: ListRepostsForPost :many
SELECT u.id::text     AS user_id,
       u.name         AS user_name,
       u.username     AS user_username,
       u."logoUrl"    AS user_logo,
       u."isCertified" AS user_certified,
       r."createdAt"  AS reposted_at
FROM "Post" r
JOIN "User" u ON u.id = r."authorId"
WHERE r."repostId" = $1
  AND r."deletedAt" IS NULL
  AND (r.content = '' OR r.content = ' ')
ORDER BY r."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: ListQuotePostIDs :many
SELECT r.id
FROM "Post" r
WHERE r."repostId" = $1
  AND r."deletedAt" IS NULL
  AND r."isDraft" = false
  AND (r.content <> '' AND r.content <> ' ')
ORDER BY r."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: GetExistingBlock :one
SELECT 1 AS present
FROM "BlockedUser"
WHERE "creatorId" = $1 AND "readerId" = $2;

-- name: InsertBlock :exec
INSERT INTO "BlockedUser" (id, "creatorId", "readerId")
VALUES (gen_random_uuid()::text, $1, $2);

-- name: DeleteBlock :exec
DELETE FROM "BlockedUser"
WHERE "creatorId" = $1 AND "readerId" = $2;

-- name: GetExistingMute :one
SELECT 1 AS present
FROM "MutedUser"
WHERE "muterId" = $1 AND "mutedId" = $2;

-- name: InsertMute :exec
INSERT INTO "MutedUser" (id, "muterId", "mutedId")
VALUES (gen_random_uuid()::text, $1, $2);

-- name: DeleteMute :exec
DELETE FROM "MutedUser"
WHERE "muterId" = $1 AND "mutedId" = $2;

-- name: CreateModerationReport :one
INSERT INTO "ModerationReport" (id, "reporterId", "targetId", "targetType", "reason", "details", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now(), now())
RETURNING id;
