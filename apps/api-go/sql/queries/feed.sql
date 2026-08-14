-- name: GetFollowedPersonalPublicationOwnerIDs :many
SELECT u.id::text AS user_id
FROM "Follows" f
JOIN "User" u ON u."publicationId" = f."publicationId"
WHERE f."readerId" = $1
  AND u."publicationId" IS NOT NULL;

-- name: FindFollowingFeed :many
SELECT p.id,
       p.content,
       p."authorId",
       p."createdAt",
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
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       u."isCertified" AS author_certified,
       (CASE WHEN l."userId" IS NOT NULL THEN true ELSE false END) AS viewer_liked,
       (CASE WHEN r.id IS NOT NULL THEN true ELSE false END)      AS viewer_reposted
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
LEFT JOIN "Like" l ON l."postId" = p.id AND l."userId" = @viewer_id
LEFT JOIN "Post" r ON r."repostId" = p.id AND r."authorId" = @viewer_id AND r."deletedAt" IS NULL AND (r.content = '' OR r.content = ' ')
WHERE p."authorId" = ANY(@author_ids::uuid[])
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND p."isDraft" = false
  AND p."deletedAt" IS NULL
  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
  AND p.visibility IN ('public', 'followers')
ORDER BY p."createdAt" DESC, p.id DESC
LIMIT @take_count OFFSET @skip_count;

-- name: FindTrending :many
SELECT p.id,
       p.content,
       p."authorId",
       p."createdAt",
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
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified,
       (CASE WHEN l."userId" IS NOT NULL THEN true ELSE false END) AS viewer_liked,
       (CASE WHEN r.id IS NOT NULL THEN true ELSE false END)      AS viewer_reposted
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
LEFT JOIN "Like" l ON l."postId" = p.id AND l."userId" = @viewer_id
LEFT JOIN "Post" r ON r."repostId" = p.id AND r."authorId" = @viewer_id AND r."deletedAt" IS NULL AND (r.content = '' OR r.content = ' ')
WHERE p."isDraft" = false
  AND p."deletedAt" IS NULL
  AND p.visibility = 'public'
  AND p."createdAt" >= now() - interval '7 days'
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
ORDER BY (p."likeCount" + p."repostCount" + p."replyCount") DESC, p."createdAt" DESC
LIMIT @take_count OFFSET @skip_count;

-- name: GetPostThread :many
SELECT p.id,
       p.content,
       p."authorId",
       p."createdAt",
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
       u.id::text      AS author_id,
       u.name          AS author_name,
       u.username      AS author_username,
       u."logoUrl"     AS author_logo,
       u."isCertified" AS author_certified,
       (CASE WHEN l."userId" IS NOT NULL THEN true ELSE false END) AS viewer_liked
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
LEFT JOIN "Like" l ON l."postId" = p.id AND l."userId" = @viewer_id
WHERE p.id = $1 OR p."rootId" = $1
ORDER BY p."createdAt" ASC;

-- name: GetRepliesForThought :many
SELECT id,
       content,
       "authorId",
       "createdAt",
       "likeCount",
       "repostCount",
       "replyCount",
       "parentId",
       "rootId",
       "repostId"
FROM "Post"
WHERE "parentId" = $1
  AND "deletedAt" IS NULL
  AND "isDraft" = false
ORDER BY "createdAt" ASC
LIMIT $2 OFFSET $3;

-- name: GetPostsByIDs :many
SELECT p.id,
       p.content,
       p."authorId",
       p."createdAt",
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
       u.id::text      AS author_id,
       u.name          AS author_name,
       u.username      AS author_username,
       u."logoUrl"     AS author_logo,
       u."isCertified" AS author_certified,
       (CASE WHEN l."userId" IS NOT NULL THEN true ELSE false END) AS viewer_liked,
       (CASE WHEN r.id IS NOT NULL THEN true ELSE false END)      AS viewer_reposted
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
LEFT JOIN "Like" l ON l."postId" = p.id AND l."userId" = @viewer_id
LEFT JOIN "Post" r ON r."repostId" = p.id AND r."authorId" = @viewer_id AND r."deletedAt" IS NULL AND (r.content = '' OR r.content = ' ')
WHERE p.id = ANY(@ids::text[])
  AND p."deletedAt" IS NULL;

-- name: GetReplyIDsForThought :many
SELECT id
FROM "Post"
WHERE "parentId" = $1
  AND "deletedAt" IS NULL
  AND "isDraft" = false
ORDER BY "createdAt" ASC;
