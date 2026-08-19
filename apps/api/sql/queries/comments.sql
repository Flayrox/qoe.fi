-- name: GetArticleCommentsConfig :one
SELECT a."allowComments" AS article_allow_comments,
       a."authorId"::text AS author_id,
       a."publicationId" AS publication_id,
       p."allowComments" AS publication_allow_comments
FROM "Article" a
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.id = $1;

-- name: GetCommentParentAuthor :one
SELECT "authorId"::text AS author_id
FROM "ArticleComment"
WHERE id = $1;

-- name: GetArticleCommentAuthor :one
SELECT "authorId"::text AS author_id
FROM "ArticleComment"
WHERE id = $1;

-- name: InsertArticleComment :one
INSERT INTO "ArticleComment" (id, "content", "articleId", "authorId", "parentId", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now(), now())
RETURNING id, "content", "createdAt", "updatedAt", "articleId", "authorId"::text AS author_id, "parentId";

-- name: GetCommentWithAuthor :one
SELECT c.id, c."content", c."createdAt", c."updatedAt", c."articleId",
       c."authorId"::text AS author_id, c."parentId",
       u.name AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo_url,
       u."isCertified" AS author_is_certified
FROM "ArticleComment" c
JOIN "User" u ON u.id = c."authorId"
WHERE c.id = $1;

-- name: ListArticleComments :many
SELECT c.id, c."content", c."createdAt", c."updatedAt", c."articleId",
       c."authorId"::text AS author_id, c."parentId",
       u.name AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo_url,
       u."isCertified" AS author_is_certified
FROM "ArticleComment" c
JOIN "User" u ON u.id = c."authorId"
WHERE c."articleId" = $1
ORDER BY c."createdAt" ASC;

-- name: DeleteArticleComment :exec
DELETE FROM "ArticleComment"
WHERE id = $1;
