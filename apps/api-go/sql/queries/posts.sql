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
INSERT INTO "Post" (id, "content", "authorId", "updatedAt", tags, "imageUrl", visibility, "contentVisibility", "isDraft", "scheduledAt", "triggerWarning", "parentId", "rootId", "repostId", "replyRestriction", "isPinned", "likeCount", "repostCount", "replyCount")
VALUES (gen_random_uuid()::text, sqlc.arg('content'), sqlc.arg('authorId'), now(), sqlc.arg('tags'), sqlc.arg('imageUrl'), sqlc.arg('visibility'), sqlc.arg('contentVisibility'), sqlc.arg('isDraft'), sqlc.arg('scheduledAt'), sqlc.arg('triggerWarning'), NULLIF(sqlc.arg('parentId'), ''), NULLIF(sqlc.arg('rootId'), ''), NULLIF(sqlc.arg('repostId'), ''), sqlc.arg('replyRestriction'), false, 0, 0, 0)
RETURNING id, "content", "authorId", "createdAt", tags, "parentId", "rootId", "repostId", "isDraft", "visibility", "contentVisibility";

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
