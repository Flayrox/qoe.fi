-- Highlights & annotations : surlignage de passages d'articles, notes,
-- visibilité publique, upvotes et commentaires d'annotation.
-- Tables : Highlight, AnnotationComment, AnnotationUpvote.

-- name: GetHighlightByID :one
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."quoteOrdinal", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       h."canonicalStart", h."canonicalEnd", h."contentSha",
       u.id::text AS reader_id,
       u.name     AS reader_name,
       u.username AS reader_username,
       u."logoUrl" AS reader_logo
FROM "Highlight" h
JOIN "User" u ON u.id = h."readerId"
WHERE h.id = $1;

-- name: ListHighlightsByArticle :many
-- Surlignages d'un article : publics + les siens (privés) + état upvote du viewer.
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."quoteOrdinal", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       h."canonicalStart", h."canonicalEnd", h."contentSha",
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
  -- Blocage symétrique : le surlignage d'un compte bloqué ne remonte jamais.
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = sqlc.arg('viewerId') AND b."creatorId" = u.id)
       OR (b."creatorId" = sqlc.arg('viewerId') AND b."readerId" = u.id)
  )
ORDER BY h."createdAt" DESC;

-- name: ListMyHighlights :many
-- Tous les surlignages d'un lecteur (bibliothèque), avec l'article associé.
SELECT h.id, h.text, h.note, h."isPublic", h."isOfficial", h."quoteOrdinal", h."upvotesCount",
       h."readerId", h."articleId", h."createdAt",
       a.title      AS article_title,
       a.slug       AS article_slug,
       p.id         AS publisher_id,
       p.name       AS publisher_name,
       p.slug       AS publisher_slug,
       p.subdomain  AS publisher_subdomain,
       p."customDomain" AS publisher_custom_domain
FROM "Highlight" h
JOIN "Article" a ON a.id = h."articleId"
JOIN "Publisher" p ON p.id = a."publisherId"
WHERE h."readerId" = $1
ORDER BY h."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: CanViewArticle :one
-- Un article n'est lisible (donc annotable) que si sa publication est
-- publiée et si son propriétaire est public, soi-même ou suivi — sans
-- blocage dans un sens ou l'autre.
SELECT EXISTS (
  SELECT 1
  FROM "Article" a
  JOIN "Publisher" p ON p.id = a."publisherId"
  LEFT JOIN "User" u ON u."publisherId" = p.id
  WHERE a.id = sqlc.arg('articleId')
    AND a.published = true
    AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
    AND (
      u.id IS NULL
      OR u.id = sqlc.arg('viewerId')::uuid
      OR COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = u.id), 'PUBLIC') = 'PUBLIC'
      OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId" = sqlc.arg('viewerId')::uuid AND f."publisherId" = p.id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM "BlockedUser" b
      WHERE u.id IS NOT NULL
        AND ((b."readerId" = sqlc.arg('viewerId')::uuid AND b."creatorId" = u.id)
          OR (b."creatorId" = sqlc.arg('viewerId')::uuid AND b."readerId" = u.id))
    )
);

-- name: CreateHighlight :one
-- Les colonnes canoniques (offsets en code points dans le document canonique
-- de l'article + empreinte du contenu) sont ADDITIVES : NULL tant qu'une
-- ancre n'a pas pu être résolue (données héritées ou contenu changé).
INSERT INTO "Highlight" (id, text, note, "isPublic", "isOfficial", "quoteOrdinal",
                         "readerId", "articleId",
                         "canonicalStart", "canonicalEnd", "contentSha")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id;

-- name: DeleteHighlight :execrows
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
-- Commentaires d'un surlignage, avec auteur. La visibilité du surlignage
-- (public ou le sien) et le blocage symétrique s'appliquent aussi ici :
-- un commentaire ne doit jamais révéler une annotation privée.
SELECT ac.id, ac.content, ac."createdAt", ac."highlightId",
       u.id::text AS author_id,
       u.name     AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo
FROM "AnnotationComment" ac
JOIN "User" u ON u.id = ac."authorId"
JOIN "Highlight" h ON h.id = ac."highlightId"
WHERE ac."highlightId" = $1
  AND (h."isPublic" = true OR h."readerId" = sqlc.arg('viewerId'))
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = sqlc.arg('viewerId') AND b."creatorId" = u.id)
       OR (b."creatorId" = sqlc.arg('viewerId') AND b."readerId" = u.id)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = sqlc.arg('viewerId') AND b."creatorId" = h."readerId")
       OR (b."creatorId" = sqlc.arg('viewerId') AND b."readerId" = h."readerId")
  )
ORDER BY ac."createdAt" ASC;

-- name: CreateAnnotationComment :one
INSERT INTO "AnnotationComment" (id, content, "highlightId", "authorId")
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id;

-- name: DeleteAnnotationComment :execrows
DELETE FROM "AnnotationComment"
WHERE id = $1 AND "authorId" = $2;
