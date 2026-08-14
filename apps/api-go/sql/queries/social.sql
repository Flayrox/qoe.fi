-- Threadgates & réponses

-- name: GetThoughtReplyGate :one
SELECT "authorId"::text AS author_id, "replyRestriction", content
FROM "Post"
WHERE id = $1;

-- name: GetPersonalPublicationID :one
SELECT "publicationId" AS id
FROM "User"
WHERE id = $1;

-- name: GetActiveSubscriptionForReply :one
SELECT 1 AS present
FROM "Subscriber"
WHERE "publicationId" = $1 AND "userId" = $2 AND "isActive" = true;

-- name: GetFollowForReply :one
SELECT 1 AS present
FROM "Follows"
WHERE "readerId" = $1 AND "publicationId" = $2;

-- name: GetUserUsername :one
SELECT username
FROM "User"
WHERE id = $1;

-- name: GetUsersByUsernames :many
SELECT id::text AS user_id, username
FROM "User"
WHERE username = ANY($1::text[]);

-- Notifications REPLY / MENTION

-- name: GetReplyPrefs :one
SELECT "emailReplies", "pushReplies", "emailMentions", "pushMentions"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: ExistsUnreadReplyNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'REPLY' AND "thoughtId" = $3 AND "isRead" = false;

-- name: InsertReplyNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId")
VALUES (gen_random_uuid()::text, $1, $2, 'REPLY', $3);

-- name: ExistsUnreadMentionNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'MENTION' AND "thoughtId" = $3 AND "isRead" = false;

-- name: InsertMentionNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "thoughtId")
VALUES (gen_random_uuid()::text, $1, $2, 'MENTION', $3);
