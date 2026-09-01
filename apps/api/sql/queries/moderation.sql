-- =====================================================================
-- 🛡️ File de modération (ModerationReport) — surface superadmin.
-- =====================================================================

-- name: ListModerationReportsWithCount :many
SELECT mr.id,
       mr."targetId",
       mr."targetType",
       mr.reason,
       mr.details,
       mr.status,
       mr."actionTaken",
       mr."createdAt",
       mr."updatedAt",
       u.id::text       AS reporter_id,
       u.name           AS reporter_name,
       u.username       AS reporter_username,
       u."logoUrl"      AS reporter_logo,
       (CASE mr."targetType"
           WHEN 'thought' THEN (SELECT p.content FROM "Post" p WHERE p.id = mr."targetId")
           WHEN 'article' THEN (SELECT a.title FROM "Article" a WHERE a.id = mr."targetId")
           WHEN 'user'    THEN (SELECT u2.username FROM "User" u2 WHERE u2.id::text = mr."targetId")
           ELSE NULL
       END)::text AS target_preview,
       (SELECT COUNT(*)::bigint
        FROM "ModerationReport" mr2
        WHERE mr2."targetId" = mr."targetId"
          AND mr2."targetType" = mr."targetType") AS target_count
FROM "ModerationReport" mr
JOIN "User" u ON u.id = mr."reporterId"
WHERE ($1::text = '' OR mr.status = $1)
ORDER BY (mr.status = 'pending') DESC, mr."createdAt" ASC
LIMIT $2 OFFSET $3;

-- name: CountModerationReportsByStatus :many
SELECT status,
       COUNT(*)::bigint AS count
FROM "ModerationReport"
GROUP BY status;

-- name: GetModerationReport :one
SELECT *
FROM "ModerationReport"
WHERE id = $1;

-- name: UpdateModerationReportResolution :one
UPDATE "ModerationReport"
SET status           = $2,
    "actionTaken"    = $3,
    "resolvedById"   = $4,
    "resolvedAt"     = $5,
    "resolutionNote" = $6,
    "updatedAt"      = $5
WHERE id = $1
RETURNING id, status, "actionTaken";

-- name: HidePostByModerator :exec
UPDATE "Post"
SET "isHiddenByModerator" = true,
    "hiddenByModeratorAt" = now()
WHERE id = $1;

-- name: UnhidePostByModerator :exec
UPDATE "Post"
SET "isHiddenByModerator" = false,
    "hiddenByModeratorAt" = NULL
WHERE id = $1;

-- name: HideArticleByModerator :exec
UPDATE "Article"
SET "isHiddenByModerator" = true,
    "hiddenByModeratorAt" = now()
WHERE id = $1;

-- name: UnhideArticleByModerator :exec
UPDATE "Article"
SET "isHiddenByModerator" = false,
    "hiddenByModeratorAt" = NULL
WHERE id = $1;

-- name: GetArticleAuthor :one
SELECT "authorId"::text AS author_id
FROM "Article"
WHERE id = $1;

-- name: CountPendingReportsByReporter :one
SELECT COUNT(*)::bigint AS count
FROM "ModerationReport"
WHERE "reporterId" = $1
  AND "targetId"   = $2
  AND "targetType" = $3
  AND status = 'pending';
