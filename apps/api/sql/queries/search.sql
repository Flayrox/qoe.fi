-- name: GetArticleForSearch :one
SELECT id, title, content, slug, "authorId", "categoryId", "publicationId", published, "isPremium",
       "seoTitle", "seoDescription", "createdAt", "updatedAt"
FROM "Article"
WHERE id = $1;

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
  AND (
    p.content ILIKE '%' || $1 || '%'
    OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE $1)
  )
ORDER BY p."createdAt" DESC, p.id DESC
LIMIT $2;
