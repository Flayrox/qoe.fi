-- name: GetInteraction :one
SELECT 1 AS present
FROM "Interaction"
WHERE "userId" = $1 AND kind = $2 AND "targetType" = $3 AND "targetId" = $4;

-- name: InsertInteraction :one
INSERT INTO "Interaction" (id, "userId", kind, "targetType", "targetId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
RETURNING id;

-- name: DeleteInteraction :exec
DELETE FROM "Interaction"
WHERE "userId" = $1 AND kind = $2 AND "targetType" = $3 AND "targetId" = $4;

-- name: ListInteractorsForTarget :many
SELECT u.id::text      AS user_id,
       u.name          AS user_name,
       u.username      AS user_username,
       u."logoUrl"     AS user_logo,
       u."isCertified" AS user_certified,
       i."createdAt"   AS acted_at
FROM "Interaction" i
JOIN "User" u ON u.id = i."userId"
LEFT JOIN "UserSettings" privacy ON privacy."userId" = i."userId"
WHERE i."targetType" = $1
  AND i."targetId" = $2
  AND i.kind = $3
  AND COALESCE(privacy."likeVisibility", 'PUBLIC') = 'PUBLIC'
ORDER BY i."createdAt" DESC
LIMIT $4 OFFSET $5;
