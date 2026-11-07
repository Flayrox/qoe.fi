-- name: GetArticleForSearch :one
SELECT id, title, content, slug, "authorId", "categoryId", "publicationId", published, "isPremium",
       "seoTitle", "seoDescription", "createdAt", "updatedAt"
FROM "Article"
WHERE id = $1;

-- name: ListArticleSlugs :many
SELECT slug FROM "ArticleSlug" WHERE "articleId" = $1;

-- name: SearchThoughts :many
SELECT p.id, p.content, p.tags, p."imageUrl", p."createdAt", p."authorId"::text AS author_id,
       u.name AS author_name, u.username AS author_username, u."logoUrl" AS author_logo,
       u."isCertified" AS author_certified,
       p."likeCount", p."repostCount", p."replyCount"
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p."isDraft" = false
  AND p."deletedAt" IS NULL
  AND p.visibility = 'public'
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  -- Blocage symétrique : le viewer ne voit jamais l'auteur qui l'a bloqué,
  -- même s'il ne l'a pas bloqué lui-même.
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" bu
    WHERE (bu."readerId" = @viewer_id AND bu."creatorId" = p."authorId")
       OR (bu."readerId" = p."authorId" AND bu."creatorId" = @viewer_id)
  )
  -- Compte privé / réservé aux abonnés : seuls le propriétaire et ses
  -- abonnés voient les pensées dans la recherche.
  AND (
    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = u.id), 'PUBLIC') = 'PUBLIC'
    OR EXISTS (
      SELECT 1 FROM "Follows" f
      WHERE f."readerId" = @viewer_id AND f."publicationId" = u."publicationId"
    )
  )
  AND (
    p.content ILIKE '%' || $1 || '%'
    OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
  )
ORDER BY p."createdAt" DESC, p.id DESC
LIMIT $2;
