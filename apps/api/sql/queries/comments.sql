-- =====================================================================
-- 💬 Commentaires d'article — désormais des posts (lot L41)
-- =====================================================================
-- Un commentaire EST un "Post" avec "rootArticleId" : il apparaît donc dans
-- les feeds, le profil et les fils comme n'importe quelle pensée, avec les
-- mêmes filtres de sécurité (blocks, mutes, visibilité de profil, mots
-- masqués) et les mêmes compteurs ("replyCount").
--
-- Invariants :
--   * niveau 1 : "rootId" NULL, "rootArticleId" = article ;
--   * réponse   : "rootId" = racine du fil de commentaires (le commentaire de
--                 niveau 1), "rootArticleId" = même article que le parent.
-- =====================================================================

-- name: GetArticleCommentsConfig :one
SELECT a."allowComments" AS article_allow_comments,
       a."authorId"::text AS author_id,
       a."publisherId" AS publisher_id,
       p."allowComments" AS publisher_allow_comments
FROM "Article" a
JOIN "Publisher" p ON p.id = a."publisherId"
WHERE a.id = $1;

-- name: GetCommentParentAuthor :one
SELECT "authorId"::text AS author_id
FROM "Post"
WHERE id = $1 AND "deletedAt" IS NULL;

-- name: GetArticleCommentAuthor :one
SELECT "authorId"::text AS author_id
FROM "Post"
WHERE id = $1 AND "deletedAt" IS NULL;

-- name: InsertArticleCommentRoot :one
INSERT INTO "Post" (id, "content", "authorId", "createdAt", "updatedAt", "rootArticleId", "replyRestriction")
VALUES (gen_random_uuid()::text, $1, $2, now(), now(), $3, 'everyone')
RETURNING id, "content", "createdAt", "updatedAt", "rootArticleId" AS article_id,
          "authorId"::text AS author_id, "parentId", "rootId" AS root_id;

-- name: InsertArticleCommentReply :one
INSERT INTO "Post" (id, "content", "authorId", "createdAt", "updatedAt",
                    "rootArticleId", "parentId", "rootId", "replyRestriction")
VALUES (gen_random_uuid()::text, $1, $2, now(), now(), $3, $4, $5, 'everyone')
RETURNING id, "content", "createdAt", "updatedAt", "rootArticleId" AS article_id,
          "authorId"::text AS author_id, "parentId", "rootId" AS root_id;

-- name: GetCommentWithAuthor :one
SELECT p.id, p."content", p."createdAt", p."updatedAt",
       p."rootArticleId" AS article_id, p."authorId"::text AS author_id,
       p."parentId", p."rootId" AS root_id,
       u.name AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo_url,
       u."isCertified" AS author_is_certified
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p.id = $1 AND p."deletedAt" IS NULL;

-- Les filtres sont ceux des feeds (helpers SQL partagés) : un commentaire ne
-- peut pas être visible ici et caché là-bas.
-- name: ListArticleComments :many
SELECT p.id, p."content", p."createdAt", p."updatedAt",
       p."rootArticleId" AS article_id, p."authorId"::text AS author_id,
       p."parentId", p."rootId" AS root_id,
       u.name AS author_name,
       u.username AS author_username,
       u."logoUrl" AS author_logo_url,
       u."isCertified" AS author_is_certified
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p."rootArticleId" = sqlc.arg('article_id')
  AND p."deletedAt" IS NULL
  AND p."isDraft" = false
  AND p."isHiddenByModerator" = false
  AND p."isHiddenByAuthor" = false
  AND p.visibility = 'public'
  AND NOT is_blocked_bidirectional(sqlc.arg('viewer_id')::uuid, p."authorId")
  AND can_view_profile(sqlc.arg('viewer_id')::uuid, u.id)
  AND NOT is_muted_by(sqlc.arg('viewer_id')::uuid, p."authorId")
  AND NOT contains_muted_word(sqlc.arg('viewer_id')::uuid, p."content")
ORDER BY p."createdAt" ASC, p.id ASC;

-- name: DeleteArticleComment :exec
DELETE FROM "Post"
WHERE id = $1;
