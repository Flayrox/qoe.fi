-- Centre de notifications : liste groupée, non-lus, lecture, préférences.

-- name: GetNotifications :many
SELECT n.id, n.type, n."isRead", n."createdAt", n."thoughtId", n."articleId", n."commentId", n."publisherId", n.metadata,
       u.id::text      AS sender_id,
       u.name          AS sender_name,
       u.username      AS sender_username,
       u."logoUrl"     AS sender_logo,
       u."isCertified" AS sender_certified,
       -- Nature publique de l'expéditeur (avatar carré d'un média) : dérivée de
       -- SA publication, jamais supposée PERSONAL côté Go.
       COALESCE(sp.type::text, '')::text AS sender_type,
       t.content       AS thought_content,
       t."createdAt"   AS thought_created_at,
       a.title         AS article_title,
       a.slug          AS article_slug,
       c.content       AS comment_content,
       p.name          AS publisher_name,
       p.slug          AS publisher_slug,
       COALESCE(p.type::text, '')::text AS publisher_type,
       COALESCE(md.id::text, '')::text  AS media_id
FROM "Notification" n
JOIN "User" u ON u.id = n."senderId"
LEFT JOIN "Post" t ON t.id = n."thoughtId"
LEFT JOIN "Article" a ON a.id = n."articleId"
LEFT JOIN "Post" c ON c.id = n."commentId"
LEFT JOIN "Publisher" p ON p.id = n."publisherId"
LEFT JOIN "Publisher" sp ON sp.id = u."publisherId"
LEFT JOIN "Media" md ON md."publisherId" = n."publisherId"
WHERE n."recipientId" = $1
  AND ($2::text[] IS NULL OR n.type::text = ANY($2::text[]))
  -- Un blocage, dans un sens ou dans l'autre, coupe aussi les notifications.
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = n."recipientId" AND b."creatorId" = n."senderId")
       OR (b."readerId" = n."senderId" AND b."creatorId" = n."recipientId")
  )
ORDER BY n."createdAt" DESC, n.id DESC
LIMIT $3 OFFSET $4;

-- name: GetUnreadCount :one
SELECT COUNT(*)::int AS count
FROM "Notification" n
WHERE n."recipientId" = $1 AND n."isRead" = false
  AND NOT EXISTS (
    SELECT 1 FROM "BlockedUser" b
    WHERE (b."readerId" = n."recipientId" AND b."creatorId" = n."senderId")
       OR (b."readerId" = n."senderId" AND b."creatorId" = n."recipientId")
  );

-- name: MarkNotificationsRead :exec
UPDATE "Notification"
SET "isRead" = true
WHERE "recipientId" = $1
  AND ($2::text[] IS NULL OR id = ANY($2::text[]));

-- name: GetNotificationPreferences :one
SELECT "emailLikes", "pushLikes", "emailReplies", "pushReplies", "emailComments", "pushComments",
       "emailMentions", "pushMentions", "emailFollows", "pushFollows",
       "emailReposts", "pushReposts", "emailMedia", "pushMedia",
       "emailCollaborations", "pushCollaborations"
FROM "NotificationPreference"
WHERE "userId" = $1;

-- name: PatchNotificationPreferences :one
-- Patch **en une seule instruction** : chaque champ envoyé est appliqué, les
-- autres gardent leur valeur (ou le défaut `true` à la création). L'ancien
-- couple lecture-puis-upsert complet perdait les mises à jour concurrentes
-- (deux onglets qui sauvent deux réglages différents).
INSERT INTO "NotificationPreference" ("id", "userId", "emailLikes", "pushLikes", "emailReplies", "pushReplies",
       "emailComments", "pushComments", "emailMentions", "pushMentions", "emailFollows", "pushFollows",
       "emailReposts", "pushReposts", "emailMedia", "pushMedia",
       "emailCollaborations", "pushCollaborations", "updatedAt")
VALUES (
  gen_random_uuid()::text, sqlc.arg(user_id),
  COALESCE(sqlc.narg(email_likes)::boolean, true), COALESCE(sqlc.narg(push_likes)::boolean, true),
  COALESCE(sqlc.narg(email_replies)::boolean, true), COALESCE(sqlc.narg(push_replies)::boolean, true),
  COALESCE(sqlc.narg(email_comments)::boolean, true), COALESCE(sqlc.narg(push_comments)::boolean, true),
  COALESCE(sqlc.narg(email_mentions)::boolean, true), COALESCE(sqlc.narg(push_mentions)::boolean, true),
  COALESCE(sqlc.narg(email_follows)::boolean, true), COALESCE(sqlc.narg(push_follows)::boolean, true),
  COALESCE(sqlc.narg(email_reposts)::boolean, true), COALESCE(sqlc.narg(push_reposts)::boolean, true),
  COALESCE(sqlc.narg(email_media)::boolean, true), COALESCE(sqlc.narg(push_media)::boolean, true),
  COALESCE(sqlc.narg(email_collaborations)::boolean, true), COALESCE(sqlc.narg(push_collaborations)::boolean, true),
  now())
ON CONFLICT ("userId") DO UPDATE SET
  "emailLikes" = COALESCE(sqlc.narg(email_likes)::boolean, "NotificationPreference"."emailLikes"),
  "pushLikes" = COALESCE(sqlc.narg(push_likes)::boolean, "NotificationPreference"."pushLikes"),
  "emailReplies" = COALESCE(sqlc.narg(email_replies)::boolean, "NotificationPreference"."emailReplies"),
  "pushReplies" = COALESCE(sqlc.narg(push_replies)::boolean, "NotificationPreference"."pushReplies"),
  "emailComments" = COALESCE(sqlc.narg(email_comments)::boolean, "NotificationPreference"."emailComments"),
  "pushComments" = COALESCE(sqlc.narg(push_comments)::boolean, "NotificationPreference"."pushComments"),
  "emailMentions" = COALESCE(sqlc.narg(email_mentions)::boolean, "NotificationPreference"."emailMentions"),
  "pushMentions" = COALESCE(sqlc.narg(push_mentions)::boolean, "NotificationPreference"."pushMentions"),
  "emailFollows" = COALESCE(sqlc.narg(email_follows)::boolean, "NotificationPreference"."emailFollows"),
  "pushFollows" = COALESCE(sqlc.narg(push_follows)::boolean, "NotificationPreference"."pushFollows"),
  "emailReposts" = COALESCE(sqlc.narg(email_reposts)::boolean, "NotificationPreference"."emailReposts"),
  "pushReposts" = COALESCE(sqlc.narg(push_reposts)::boolean, "NotificationPreference"."pushReposts"),
  "emailMedia" = COALESCE(sqlc.narg(email_media)::boolean, "NotificationPreference"."emailMedia"),
  "pushMedia" = COALESCE(sqlc.narg(push_media)::boolean, "NotificationPreference"."pushMedia"),
  "emailCollaborations" = COALESCE(sqlc.narg(email_collaborations)::boolean, "NotificationPreference"."emailCollaborations"),
  "pushCollaborations" = COALESCE(sqlc.narg(push_collaborations)::boolean, "NotificationPreference"."pushCollaborations"),
  "updatedAt" = now()
RETURNING "emailLikes", "pushLikes", "emailReplies", "pushReplies", "emailComments", "pushComments",
  "emailMentions", "pushMentions", "emailFollows", "pushFollows",
  "emailReposts", "pushReposts", "emailMedia", "pushMedia",
  "emailCollaborations", "pushCollaborations";
