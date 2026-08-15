-- RBAC Média (rôles + permissions) — partagé par settings, articles et media.

-- name: GetMediaMemberContext :one
SELECT m.id            AS member_id,
       m."mediaId"     AS media_id,
       m.role,
       m.permissions,
       m.status
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
WHERE md."publicationId" = $1 AND m."userId" = $2
LIMIT 1;

-- name: GetPublicationTypeByID :one
SELECT type FROM "Publication" WHERE id = $1;
