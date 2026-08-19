-- Centre de notifications : liste groupée, non-lus, lecture, préférences.

-- name: GetNotifications :many
SELECT n.id, n.type, n."isRead", n."createdAt", n."thoughtId", n."articleId", n."commentId", n."publicationId",
       u.id::text      AS sender_id,
       u.name          AS sender_name,
       u.username      AS sender_username,
       u."logoUrl"     AS sender_logo,
       u."isCertified" AS sender_certified,
       t.content       AS thought_content,
       t."createdAt"   AS thought_created_at,
       a.title         AS article_title,
       a.slug          AS article_slug,
       c.content       AS comment_content,
       p.name          AS publication_name,
       p.slug          AS publication_slug
FROM "Notification" n
JOIN "User" u ON u.id = n."senderId"
LEFT JOIN "Post" t ON t.id = n."thoughtId"
LEFT JOIN "Article" a ON a.id = n."articleId"
LEFT JOIN "ArticleComment" c ON c.id = n."commentId"
LEFT JOIN "Publication" p ON p.id = n."publicationId"
WHERE n."recipientId" = $1
  AND ($2::text[] IS NULL OR n.type::text = ANY($2::text[]))
ORDER BY n."createdAt" DESC, n.id DESC
LIMIT $3 OFFSET $4;

-- name: GetUnreadCount :one
SELECT COUNT(*)::int AS count
FROM "Notification"
WHERE "recipientId" = $1 AND "isRead" = false;

-- name: MarkNotificationsRead :exec
UPDATE "Notification"
SET "isRead" = true
WHERE "recipientId" = $1
  AND ($2::text[] IS NULL OR id = ANY($2::text[]));

-- name: GetNotificationPreferences :one
SELECT "emailLikes", "pushLikes", "emailReplies", "pushReplies", "emailComments", "pushComments",
       "emailMentions", "pushMentions", "emailFollows", "pushFollows",
       "emailReposts", "pushReposts", "emailMedia", "pushMedia"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: UpsertNotificationPreferences :exec
INSERT INTO "NotificationPreference" ("id", "userId", "emailLikes", "pushLikes", "emailReplies", "pushReplies",
       "emailComments", "pushComments", "emailMentions", "pushMentions", "emailFollows", "pushFollows",
       "emailReposts", "pushReposts", "emailMedia", "pushMedia", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
ON CONFLICT ("userId") DO UPDATE SET
  "emailLikes" = EXCLUDED."emailLikes", "pushLikes" = EXCLUDED."pushLikes",
  "emailReplies" = EXCLUDED."emailReplies", "pushReplies" = EXCLUDED."pushReplies",
  "emailComments" = EXCLUDED."emailComments", "pushComments" = EXCLUDED."pushComments",
  "emailMentions" = EXCLUDED."emailMentions", "pushMentions" = EXCLUDED."pushMentions",
  "emailFollows" = EXCLUDED."emailFollows", "pushFollows" = EXCLUDED."pushFollows",
  "emailReposts" = EXCLUDED."emailReposts", "pushReposts" = EXCLUDED."pushReposts",
  "emailMedia" = EXCLUDED."emailMedia", "pushMedia" = EXCLUDED."pushMedia",
  "updatedAt" = now();
