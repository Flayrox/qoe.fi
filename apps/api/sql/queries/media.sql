-- RBAC Média (rôles + permissions) — partagé par settings, articles et media.

-- name: GetMediaMemberContext :one
SELECT m.id            AS member_id,
       m."mediaId"     AS media_id,
       m.role,
       m.permissions,
       m.status
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
WHERE md."publisherId" = $1 AND m."userId" = $2 AND m.status = 'active'
LIMIT 1;

-- name: GetPublisherTypeByID :one
SELECT type, name FROM "Publisher" WHERE id = $1;
