-- =====================================================================
-- 🧭 Décisions d'éligibilité par surface (lot L43)
-- =====================================================================
-- Une seule lecture renvoie les faits nécessaires pour décider ET expliquer :
-- l'état du post, celui de son auteur, et le lien du viewer avec lui. Les
-- prédicats sont les mêmes fonctions STABLE que les flux (aucune seconde
-- politique) ; la décision finale est prise en Go par le package eligibility
-- (Decide/Rank), avec les poids `feed.rank_*` de SystemConfig.
--
-- La requête ne renvoie AUCUN contenu : uniquement des ids, des dates, des
-- compteurs et des booléens. Elle sert les surfaces d'explication (admin,
-- debug) et les états vides motivés, jamais un flux public.
-- =====================================================================

-- name: ListEligibilityCandidates :many
SELECT p.id,
       p."authorId"::text                                   AS author_id,
       p."createdAt",
       p.visibility,
       p."isDraft",
       (p."deletedAt" IS NOT NULL)::boolean                 AS is_deleted,
       p."isHiddenByModerator",
       p."isHiddenByAuthor",
       u."isSuspended"                                      AS author_suspended,
       u."isShadowbanned"                                   AS author_restricted,
       is_blocked_bidirectional(sqlc.arg('viewer_id')::uuid, p."authorId") AS blocked,
       is_muted_by(sqlc.arg('viewer_id')::uuid, p."authorId")              AS muted,
       contains_muted_word(sqlc.arg('viewer_id')::uuid, p."content")       AS muted_word,
       (NOT can_view_profile(sqlc.arg('viewer_id')::uuid, u.id))::boolean   AS profile_private,
       COALESCE(p."rootArticleId"::text, '')::text          AS root_article_id,
       (p."authorId" = sqlc.arg('viewer_id')::uuid)::boolean AS viewer_is_author,
       EXISTS (
         SELECT 1 FROM "Follows" f
         WHERE f."readerId" = sqlc.arg('viewer_id')::uuid
           AND f."publisherId" = u."publisherId"
       )::boolean                                           AS viewer_follows_author,
       p."likeCount",
       p."replyCount",
       p."repostCount"
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p."createdAt" >= now() - interval '30 days'
ORDER BY p."createdAt" DESC
LIMIT sqlc.arg('take_count')::int;

-- name: GetReactionFacts :one
-- Faits nécessaires pour autoriser une réaction sur un post : la décision
-- reste celle d'eligibility.Decide (aucune règle de visibilité locale).
SELECT p.id::text                                    AS post_id,
       p."authorId"::text                            AS author_id,
       p."createdAt"                                 AS created_at,
       p.visibility::text                            AS visibility,
       p."isDraft"                                   AS is_draft,
       (p."deletedAt" IS NOT NULL)::boolean          AS is_deleted,
       p."isHiddenByModerator"                      AS is_hidden_by_moderator,
       p."isHiddenByAuthor"                          AS is_hidden_by_author,
       COALESCE(u."isSuspended", false)              AS author_suspended,
       false                                         AS author_restricted
FROM "Post" p
JOIN "User" u ON u.id = p."authorId"
WHERE p.id = $1;
