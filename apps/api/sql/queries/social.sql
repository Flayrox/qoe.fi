-- Threadgates & réponses

-- name: GetThoughtReplyGate :one
SELECT "authorId"::text AS author_id, "replyRestriction", content
FROM "Post"
WHERE id = $1;

-- name: GetPersonalPublisherID :one
SELECT "publisherId" AS id
FROM "User"
WHERE id = $1;

-- name: GetActiveSubscriptionForReply :one
SELECT 1 AS present
FROM "Subscriber"
WHERE "publisherId" = $1 AND "userId" = $2 AND "isActive" = true;

-- name: GetFollowForReply :one
SELECT 1 AS present
FROM "Follows"
WHERE "readerId" = $1 AND "publisherId" = $2;

-- name: GetUserUsername :one
SELECT username
FROM "User"
WHERE id = $1;

-- name: GetUsersByUsernames :many
SELECT id::text AS user_id, username
FROM "User"
WHERE username = ANY($1::text[]);
