-- Polls, votes, pièces jointes

-- name: GetPollByThoughtID :one
SELECT id, "thoughtId", "expiresAt"
FROM "Poll"
WHERE "thoughtId" = $1;

-- name: GetPollOptions :many
SELECT id, "pollId", text, "order"
FROM "PollOption"
WHERE "pollId" = $1
ORDER BY "order" ASC;

-- name: CountPollVotes :one
SELECT COUNT(*)::int AS count
FROM "PollVote"
WHERE "pollId" = $1;

-- name: CountOptionVotes :one
SELECT COUNT(*)::int AS count
FROM "PollVote"
WHERE "optionId" = $1;

-- name: GetUserPollVote :one
SELECT "optionId"
FROM "PollVote"
WHERE "pollId" = $1 AND "userId" = $2;

-- name: CreatePoll :one
INSERT INTO "Poll" (id, "thoughtId", "expiresAt")
VALUES (gen_random_uuid()::text, $1, $2)
RETURNING id, "thoughtId", "expiresAt";

-- name: CreatePollOption :one
INSERT INTO "PollOption" (id, "pollId", text, "order")
VALUES (gen_random_uuid()::text, $1, $2, $3)
RETURNING id;

-- name: GetAttachmentsByIDs :many
SELECT id, "thoughtId", type, url, "altText", width, height, "order"
FROM "MediaAttachment"
WHERE "thoughtId" = ANY($1::text[])
ORDER BY "order" ASC;

-- name: GetPollsByIDs :many
SELECT id, "thoughtId", "expiresAt"
FROM "Poll"
WHERE "thoughtId" = ANY($1::text[]);

-- name: GetPollOptionsByIDs :many
SELECT id, "pollId", text, "order"
FROM "PollOption"
WHERE "pollId" = ANY($1::text[])
ORDER BY "order" ASC;

-- name: CountPollVotesByIDs :many
SELECT "pollId", COUNT(*)::int AS count
FROM "PollVote"
WHERE "pollId" = ANY($1::text[])
GROUP BY "pollId";

-- name: CountOptionVotesByIDs :many
SELECT o."pollId", v."optionId", COUNT(*)::int AS count
FROM "PollVote" v
JOIN "PollOption" o ON o.id = v."optionId"
WHERE o."pollId" = ANY($1::text[])
GROUP BY o."pollId", v."optionId";

-- name: GetUserVotesByIDs :many
SELECT "pollId", "optionId"
FROM "PollVote"
WHERE "pollId" = ANY($1::text[]) AND "userId" = $2;

-- name: CreateAttachment :one
INSERT INTO "MediaAttachment" (id, "thoughtId", type, url, "altText", width, height, "order")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: GetPollOptionByID :one
SELECT id, "pollId", text, "order"
FROM "PollOption"
WHERE id = $1;

-- name: GetUserVoteForPoll :one
SELECT v."optionId"
FROM "PollVote" v
WHERE v."pollId" = $1 AND v."userId" = $2
LIMIT 1;

-- name: InsertPollVote :one
-- Vote (idempotent : ON CONFLICT DO UPDATE pour changer d'option).
INSERT INTO "PollVote" (id, "pollId", "optionId", "userId")
VALUES (gen_random_uuid()::text, $1, $2, $3)
ON CONFLICT ("pollId", "userId") DO UPDATE SET "optionId" = EXCLUDED."optionId"
RETURNING id;

-- name: DeletePollVote :exec
DELETE FROM "PollVote"
WHERE "pollId" = $1 AND "userId" = $2;

-- name: CountPollVotesByPollID :one
SELECT COUNT(*)::int AS count
FROM "PollVote"
WHERE "pollId" = $1;
