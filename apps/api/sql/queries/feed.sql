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
  AND p."isHiddenByModerator" = false
  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
  AND p.visibility IN ('public', 'followers')
  -- Blocage symétrique : un follow existant ne suffit pas si l'un des deux
  -- a bloqué l'autre depuis.
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" bu
    WHERE (bu."readerId" = @viewer_id AND bu."creatorId" = p."authorId")
       OR (bu."readerId" = p."authorId" AND bu."creatorId" = @viewer_id)
  )
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
  AND p."isHiddenByModerator" = false
  AND p.visibility = 'public'
  AND p."createdAt" >= now() - interval '7 days'
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" bu
    WHERE (bu."readerId" = @viewer_id AND bu."creatorId" = p."authorId")
       OR (bu."readerId" = p."authorId" AND bu."creatorId" = @viewer_id)
  )
  -- Les comptes privés ne percent pas dans Découvrir : leur contenu reste
  -- réservé aux abonnés approuvés.
  AND (
    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = u.id), 'PUBLIC') = 'PUBLIC'
    OR EXISTS (
      SELECT 1 FROM "Follows" f
      WHERE f."readerId" = @viewer_id AND f."publicationId" = u."publicationId"
    )
  )
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
  AND "isHiddenByModerator" = false
  AND "isDraft" = false
ORDER BY "createdAt" ASC
LIMIT $2 OFFSET $3;

-- name: FindPostsByAuthor :many
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
WHERE p."authorId" = @author_id::uuid
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND p."isDraft" = false
  AND p."deletedAt" IS NULL
  AND p."isHiddenByModerator" = false
  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
  AND p.visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" bu
    WHERE (bu."readerId" = @viewer_id AND bu."creatorId" = p."authorId")
       OR (bu."readerId" = p."authorId" AND bu."creatorId" = @viewer_id)
  )
ORDER BY p."createdAt" DESC, p.id DESC
LIMIT @take_count OFFSET @skip_count;

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
       p."quotedArticleId",
       p."quotedExcerpt",
       p."quotedAnnotation",
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
  AND p."deletedAt" IS NULL
  AND p."isDraft" = false
  AND p."isHiddenByModerator" = false
  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = @viewer_id AND (
             b."creatorId" = u.id
             OR b."creatorId" = (SELECT owner.id FROM "Publication" pv JOIN "User" owner ON owner."publicationId" = pv.id WHERE pv.id = u."publicationId" LIMIT 1)
           ))
       OR (b."creatorId" = @viewer_id AND (
             b."readerId" = u.id
             OR b."readerId" = (SELECT owner.id FROM "Publication" pv JOIN "User" owner ON owner."publicationId" = pv.id WHERE pv.id = u."publicationId" LIMIT 1)
           ))
  )
  AND (
    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us
              WHERE us."userId" = COALESCE(
                (SELECT owner.id FROM "Publication" pv JOIN "User" owner ON owner."publicationId" = pv.id WHERE pv.id = u."publicationId" LIMIT 1),
                u.id
              )), 'PUBLIC') = 'PUBLIC'
    OR u.id = @viewer_id
    OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId" = @viewer_id AND f."publicationId" = u."publicationId")
  );

-- name: GetQuotedArticlesByIDs :many
SELECT a.id,
       a.title,
       a.slug,
       a.content,
       a."isPremium",
       p.id   AS pub_id,
       p.type,
       p.name,
       p.slug AS pub_slug,
       p.subdomain,
       p."customDomain",
       p."logoUrl"       AS pub_logo,
       p."isCertified"   AS pub_certified,
       u.id::text AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       u."isCertified" AS author_certified
FROM "Article" a
JOIN "Publication" p ON p.id = a."publicationId"
JOIN "User" u ON u.id = a."authorId"
WHERE a.id = ANY(@ids::text[])
  AND a.published = true
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
  -- Blocage symétrique : ni l'auteur ni le propriétaire de la publication.
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = @viewer_id AND (
             b."creatorId" = a."authorId"
             OR b."creatorId" = (SELECT owner.id FROM "User" owner WHERE owner."publicationId" = p.id LIMIT 1)
           ))
       OR (b."creatorId" = @viewer_id AND (
             b."readerId" = a."authorId"
             OR b."readerId" = (SELECT owner.id FROM "User" owner WHERE owner."publicationId" = p.id LIMIT 1)
           ))
  )
  -- Compte privé / réservé aux abonnés : la visibilité du propriétaire fait foi.
  AND (
    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us
              WHERE us."userId" = COALESCE(
                (SELECT owner.id FROM "User" owner WHERE owner."publicationId" = p.id LIMIT 1),
                a."authorId"
              )), 'PUBLIC') = 'PUBLIC'
    OR COALESCE(
         (SELECT owner.id FROM "User" owner WHERE owner."publicationId" = p.id LIMIT 1),
         a."authorId"
       ) = @viewer_id
    OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId" = @viewer_id AND f."publicationId" = p.id)
  );

-- name: GetReplyIDsForThought :many
SELECT id
FROM "Post"
WHERE "parentId" = $1
  AND "deletedAt" IS NULL
  AND "isHiddenByModerator" = false
  AND "isDraft" = false
ORDER BY "createdAt" ASC;

-- name: GetFollowingStateByAuthorIDs :many
SELECT u.id::text AS author_id,
       (f.id IS NOT NULL)::boolean AS is_following
FROM "User" u
LEFT JOIN "Follows" f ON f."readerId" = @viewer_id
  AND f."publicationId" = u."publicationId"
WHERE u.id = ANY(@ids::uuid[])
  AND u."publicationId" IS NOT NULL;
