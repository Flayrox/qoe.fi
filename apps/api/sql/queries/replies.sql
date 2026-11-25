-- =====================================================================
-- 🧵 Pagination unique des fils de réponses (lot L42)
-- =====================================================================
-- Une seule requête sert les trois surfaces : réponses d'un post, fil
-- complet d'une conversation (par "rootId"), et commentaires de niveau 1 d'un
-- article. Le curseur est un ordre total ("createdAt", id) : stable même
-- quand des réponses arrivent pendant la lecture (elles tombent après le
-- curseur, donc dans une page suivante, jamais en double).
--
-- Tombstone : un post supprimé, masqué (auteur/modération) ou invisible pour
-- CE viewer (blocage, mute, profil privé, mot masqué, compte suspendu) est
-- renvoyé comme une ligne sans contenu ni auteur. La structure du fil et le
-- compteur "replyCount" restent lisibles, et aucune donnée n'est révélée.
-- =====================================================================

-- name: ListThreadPage :many
SELECT p.id,
       p."parentId",
       p."rootId",
       p."createdAt",
       p."updatedAt",
       p."replyCount",
       p."likeCount",
       p."repostCount",
       (t.reason <> '')                     AS tombstone,
       t.reason                             AS tombstone_reason,
       CASE WHEN t.reason <> '' THEN ''::text ELSE p."content"::text END AS content,
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
CROSS JOIN LATERAL (
    -- La raison est calculée dans le MÊME LATERAL que la visibilité : une seule
    -- expression décide et explique (L43), jamais deux listes de prédicats qui
    -- divergent. L'ordre est significatif : la cause la plus factuelle gagne.
    SELECT COALESCE(CASE
             WHEN p."deletedAt" IS NOT NULL THEN 'deleted'
             WHEN p."isHiddenByModerator" THEN 'moderated'
             WHEN p."isHiddenByAuthor" THEN 'hidden_by_author'
             WHEN u."isSuspended" THEN 'suspended'
             WHEN u."isShadowbanned" THEN 'restricted'
             WHEN is_blocked_bidirectional(sqlc.arg('viewer_id')::uuid, p."authorId") THEN 'blocked'
             WHEN NOT can_view_profile(sqlc.arg('viewer_id')::uuid, u.id) THEN 'private_profile'
             WHEN is_muted_by(sqlc.arg('viewer_id')::uuid, p."authorId") THEN 'muted'
             WHEN contains_muted_word(sqlc.arg('viewer_id')::uuid, p."content") THEN 'muted_word'
             ELSE ''
           END, '')::text AS reason
) t
WHERE (
        (sqlc.arg('scope')::text = 'children' AND p."parentId" = sqlc.arg('parent_id')::text)
     OR (sqlc.arg('scope')::text = 'thread'   AND p."rootId"    = sqlc.arg('root_id')::text)
     OR (sqlc.arg('scope')::text = 'roots'    AND p."rootArticleId" = sqlc.arg('article_id')::text
                                             AND p."parentId" IS NULL)
      )
  AND p."isDraft" = false
  AND (sqlc.narg('cursor_at')::timestamp IS NULL
       OR (p."createdAt", p.id) > (sqlc.narg('cursor_at')::timestamp, sqlc.narg('cursor_id')::text))
ORDER BY p."createdAt" ASC, p.id ASC
LIMIT sqlc.arg('take_count')::int;

-- Total de la même portée que ListThreadPage, SANS curseur : il compte les
-- places du fil (tombstones compris), exactement ce que la pagination finit
-- par rendre. Le filtre structurel est le même ; la politique de visibilité
-- reste dans le LATERAL de ListThreadPage, jamais recopiée ici.
-- name: CountThreadPage :one
SELECT COUNT(*)::int AS total
FROM "Post" p
WHERE (
        (sqlc.arg('scope')::text = 'children' AND p."parentId" = sqlc.arg('parent_id')::text)
     OR (sqlc.arg('scope')::text = 'thread'   AND p."rootId"    = sqlc.arg('root_id')::text)
     OR (sqlc.arg('scope')::text = 'roots'    AND p."rootArticleId" = sqlc.arg('article_id')::text
                                             AND p."parentId" IS NULL)
      )
  AND p."isDraft" = false;

-- Onglet « réponses » d'un profil : les réponses vivantes d'un compte, du plus
-- récent au plus ancien. Les ids seuls suffisent, l'hydratation (auteur,
-- capacités, pièces jointes) réutilise celle du feed.
-- name: ListAuthorReplyIDsPage :many
SELECT p.id, p."createdAt"
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p."authorId" = sqlc.arg('author_id')::uuid
  AND p."parentId" IS NOT NULL
  AND p."deletedAt" IS NULL
  AND p."isDraft" = false
  AND p."isHiddenByModerator" = false
  AND p.visibility = 'public'
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND NOT is_blocked_bidirectional(sqlc.arg('viewer_id')::uuid, p."authorId")
  AND (sqlc.narg('cursor_at')::timestamp IS NULL
       OR (p."createdAt", p.id) < (sqlc.narg('cursor_at')::timestamp, sqlc.narg('cursor_id')::text))
ORDER BY p."createdAt" DESC, p.id DESC
LIMIT sqlc.arg('take_count')::int;
