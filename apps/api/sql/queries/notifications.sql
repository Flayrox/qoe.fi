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

-- name: GetPublicationOwner :one
SELECT COALESCE(
  CASE
    WHEN p.type = 'MEDIA' THEN (
      SELECT mm."userId"::text
      FROM "MediaMember" mm
      JOIN "Media" m ON m.id = mm."mediaId"
      WHERE m."publicationId" = p.id AND mm.role = 'owner' AND mm.status = 'active'
      LIMIT 1
    )
    ELSE u.id::text
  END,
  ''
)::text AS owner_id
FROM "Publication" p
LEFT JOIN "User" u ON u."publicationId" = p.id
WHERE p.id = $1;

-- name: GetFollowPrefs :one
SELECT "emailFollows", "pushFollows"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: ExistsUnreadFollowNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1
  AND "senderId" = $2
  AND type = 'FOLLOW'
  AND "publicationId" = $3
  AND "isRead" = false;

-- name: InsertFollowNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "publicationId")
VALUES (gen_random_uuid()::text, $1, $2, 'FOLLOW', $3);

-- name: DeleteFollowNotification :exec
DELETE FROM "Notification"
WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'FOLLOW' AND "publicationId" = $3;

-- name: GetCommentPrefs :one
SELECT "emailComments", "pushComments"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: ExistsUnreadCommentNotification :one
SELECT 1 AS present
FROM "Notification"
WHERE "recipientId" = $1
  AND "senderId" = $2
  AND type = 'COMMENT'
  AND "commentId" = $3
  AND "isRead" = false;

-- name: InsertCommentNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "commentId", "publicationId")
VALUES (gen_random_uuid()::text, $1, $2, 'COMMENT', $3, $4, $5);

-- name: InsertMediaArticlePublishedFanout :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "publicationId")
SELECT gen_random_uuid()::text,
       f."readerId",
       sqlc.arg('sender_id'),
       'MEDIA_ARTICLE_PUBLISHED',
       sqlc.arg('article_id'),
       f."publicationId"
FROM "Follows" f
JOIN "Publication" pub ON pub.id = f."publicationId"
LEFT JOIN "NotificationPreference" np ON np."userId" = f."readerId"
WHERE f."publicationId" = sqlc.arg('publication_id')
  AND pub.type = 'MEDIA'
  AND f."readerId" <> sqlc.arg('sender_id')
  AND (COALESCE(np."emailMedia", true) OR COALESCE(np."pushMedia", true))
  AND NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."recipientId" = f."readerId"
      AND n."senderId" = sqlc.arg('sender_id')
      AND n.type = 'MEDIA_ARTICLE_PUBLISHED'
      AND n."articleId" = sqlc.arg('article_id')
      AND n."isRead" = false
  )
LIMIT 500;

-- name: InsertMediaInviteNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "publicationId")
SELECT gen_random_uuid()::text,
       sqlc.arg('recipient_id')::uuid,
       sqlc.arg('sender_id')::uuid,
       'MEDIA_INVITE',
       sqlc.arg('publication_id')::text
WHERE sqlc.arg('recipient_id')::uuid <> sqlc.arg('sender_id')::uuid
  AND (
    COALESCE((SELECT "pushMedia" FROM "NotificationPreference"
              WHERE "userId" = sqlc.arg('recipient_id')::uuid), true)
    OR COALESCE((SELECT "emailMedia" FROM "NotificationPreference"
              WHERE "userId" = sqlc.arg('recipient_id')::uuid), true)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."recipientId" = sqlc.arg('recipient_id')::uuid
      AND n."senderId" = sqlc.arg('sender_id')::uuid
      AND n.type = 'MEDIA_INVITE'
      AND n."publicationId" = sqlc.arg('publication_id')::text
      AND n."isRead" = false
  );

-- name: InsertMediaMemberJoinedNotification :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "publicationId")
SELECT gen_random_uuid()::text,
       sqlc.arg('recipient_id')::uuid,
       sqlc.arg('sender_id')::uuid,
       'MEDIA_MEMBER_JOINED',
       sqlc.arg('publication_id')::text
WHERE sqlc.arg('recipient_id')::uuid <> sqlc.arg('sender_id')::uuid
  AND (
    COALESCE((SELECT "pushMedia" FROM "NotificationPreference"
              WHERE "userId" = sqlc.arg('recipient_id')::uuid), true)
    OR COALESCE((SELECT "emailMedia" FROM "NotificationPreference"
              WHERE "userId" = sqlc.arg('recipient_id')::uuid), true)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."recipientId" = sqlc.arg('recipient_id')::uuid
      AND n."senderId" = sqlc.arg('sender_id')::uuid
      AND n.type = 'MEDIA_MEMBER_JOINED'
      AND n."publicationId" = sqlc.arg('publication_id')::text
      AND n."isRead" = false
  );

-- name: InsertMediaArticleSubmittedFanout :exec
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "publicationId")
SELECT gen_random_uuid()::text,
       m."userId",
       sqlc.arg('sender_id'),
       'MEDIA_ARTICLE_SUBMITTED',
       sqlc.arg('article_id'),
       md."publicationId"
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
WHERE md."publicationId" = sqlc.arg('publication_id')
  AND m."userId" <> sqlc.arg('sender_id')
  AND (m.status = 'active' OR m.status = 'invited')
  AND (
    (m.role IN ('owner', 'editor') AND NOT (COALESCE(m.permissions, ARRAY[]::text[]) && ARRAY['-media:review']::text[]))
    OR (COALESCE(m.permissions, ARRAY[]::text[]) && ARRAY['media:review']::text[])
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."recipientId" = m."userId"
      AND n."senderId" = sqlc.arg('sender_id')
      AND n.type = 'MEDIA_ARTICLE_SUBMITTED'
      AND n."articleId" = sqlc.arg('article_id')
      AND n."isRead" = false
  )
LIMIT 500;
