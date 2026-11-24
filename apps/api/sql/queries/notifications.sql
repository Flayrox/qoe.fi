-- name: GetPostAuthor :one
SELECT "authorId"::text AS author_id
FROM "Post"
WHERE id = $1;

-- name: DeleteLikeNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'LIKE' AND "thoughtId" = $3;

-- name: DeleteRepostNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'REPOST' AND "thoughtId" = $3;

-- name: GetPublisherOwner :one
SELECT COALESCE(
  CASE
    WHEN p.type = 'MEDIA' THEN (
      SELECT mm."userId"::text
      FROM "MediaMember" mm
      JOIN "Media" m ON m.id = mm."mediaId"
      WHERE m."publisherId" = p.id AND mm.role = 'owner' AND mm.status = 'active'
      LIMIT 1
    )
    ELSE u.id::text
  END,
  ''
)::text AS owner_id
FROM "Publisher" p
LEFT JOIN "User" u ON u."publisherId" = p.id
WHERE p.id = $1;

-- name: DeleteFollowNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'FOLLOW' AND "publisherId" = $3;

