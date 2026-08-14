-- name: GetPostAuthor :one
SELECT "authorId"::text AS author_id
FROM "Post"
WHERE id = $1;

-- name: GetLikePrefs :one
SELECT "emailLikes", "pushLikes"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: ExistsUnreadLikeNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1
  AND "senderId" = $2
  AND type = 'LIKE'
  AND "thoughtId" = $3
  AND "isRead" = false;

-- name: InsertLikeNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId")
VALUES (gen_random_uuid()::text, $1, $2, 'LIKE', $3);

-- name: ExistsUnreadRepostNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1
  AND "senderId" = $2
  AND type = 'REPOST'
  AND "thoughtId" = $3
  AND "isRead" = false;

-- name: InsertRepostNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId")
VALUES (gen_random_uuid()::text, $1, $2, 'REPOST', $3);

-- name: DeleteLikeNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'LIKE' AND "thoughtId" = $3;

-- name: DeleteRepostNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'REPOST' AND "thoughtId" = $3;
