-- Highlights & annotations : surlignage de passages d'articles, notes,
-- visibilité publique, upvotes et commentaires d'annotation.
-- Tables : Highlight, AnnotationComment, AnnotationUpvote.

-- name: GetHighlightByID :one
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       u.id::text AS reader_id,
       u.name     AS reader_name,
       u.username AS reader_username,
       u."logoUrl" AS reader_logo
FROM "Highlight" h
JOIN "User" u ON u.id = h."readerId"
WHERE h.id = $1;

-- name: ListHighlightsByArticle :many
-- Surlignages d'un article : publics + les siens (privés) + état upvote du viewer.
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       u.id::text AS reader_id,
       u.name     AS reader_name,
       u.username AS reader_username,
       u."logoUrl" AS reader_logo,
       EXISTS (
         SELECT 1 FROM "AnnotationUpvote" au
         WHERE au."highlightId" = h.id AND au."userId" = sqlc.arg('viewerId')
       ) AS viewer_upvoted,
       (SELECT COUNT(*)::int FROM "AnnotationComment" ac
        WHERE ac."highlightId" = h.id) AS comments_count
FROM "Highlight" h
JOIN "User" u ON u.id = h."readerId"
WHERE h."articleId" = $1
  AND (h."isPublic" = true OR h."readerId" = sqlc.arg('viewerId'))
ORDER BY h."createdAt" DESC;

-- name: ListMyHighlights :many
-- Tous les surlignages d'un lecteur (bibliothèque), avec l'article associé.
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       a.title      AS article_title,
       a.slug       AS article_slug,
       p.id         AS publication_id,
       p.name       AS publication_name,
       p.slug       AS publication_slug,
       p.subdomain  AS publication_subdomain,
       p."customDomain" AS publication_custom_domain
FROM "Highlight" h
JOIN "Article" a ON a.id = h."articleId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE h."readerId" = $1
ORDER BY h."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: CreateHighlight :one
INSERT INTO "Highlight" (id, text, note, "isPublic", "isOfficial", "readerId", "articleId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
RETURNING id;-- name: DeleteHighlight :execrows
DELETE FROM "Highlight" WHERE id = $1 AND "readerId" = $2;

-- name: UpdateHighlight :one
UPDATE "Highlight"
SET note = COALESCE($3, note),
    "isPublic" = COALESCE($4, "isPublic")
WHERE id = $1 AND "readerId" = $2
RETURNING id, text, note, "isPublic", "isOfficial", "readerId", "articleId", "createdAt";

-- name: ToggleHighlightUpvote :one
-- Ajoute un upvote (idempotent). ⚠️ Le retrait et le comptage sont gérés
-- séparément dans le service (les CTE PostgreSQL sont matérialisés, un
-- COUNT dans le même statement ne verrait pas l'insertion).
INSERT INTO "AnnotationUpvote" (id, "highlightId", "userId")
VALUES (gen_random_uuid()::text, $1, $2)
ON CONFLICT ("highlightId", "userId") DO NOTHING
RETURNING 1 AS added;

-- name: DeleteHighlightUpvote :exec
DELETE FROM "AnnotationUpvote"
WHERE "highlightId" = $1 AND "userId" = $2;

-- name: CountHighlightUpvotes :one
SELECT COUNT(*)::int AS count
FROM "AnnotationUpvote"
WHERE "highlightId" = $1;


-- name: ListAnnotationComments :many
-- Commentaires d'un surlignage, avec auteur.
SELECT ac.id, ac.content, ac."createdAt", ac."highlightId",
       u.id::text AS author_id,
       u.name     AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo
FROM "AnnotationComment" ac
JOIN "User" u ON u.id = ac."authorId"
WHERE ac."highlightId" = $1
ORDER BY ac."createdAt" ASC;

-- name: CreateAnnotationComment :one
INSERT INTO "AnnotationComment" (id, content, "highlightId", "authorId")
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id;

-- name: DeleteAnnotationComment :execrows
DELETE FROM "AnnotationComment"
WHERE id = $1 AND "authorId" = $2;
