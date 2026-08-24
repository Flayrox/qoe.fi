-- Collaborations / attributions (migration de studio advanced/actions.ts).

-- name: GetArticleForCollaboration :one
SELECT id, "authorId"::text AS author_id, "publicationId"
FROM "Article"
WHERE id = $1;

-- name: IsActiveMediaMember :one
SELECT EXISTS (
  SELECT 1 FROM "MediaMember" mm
  JOIN "Media" m ON m.id = mm."mediaId"
  WHERE m."publicationId" = $1 AND mm."userId" = $2 AND mm.status = 'active'
) AS "exists";

-- name: GetUserWithCollabPrefsByEmail :one
SELECT u.id::text AS id, u.email, u.name, u.username,
       u."isSuspended", u."isShadowbanned",
       COALESCE(s."allowCollaborationInvites", true) AS allow_collab
FROM "User" u
LEFT JOIN "UserSettings" s ON s."userId" = u.id
WHERE u.email = $1;

-- name: GetUserWithCollabPrefsByID :one
SELECT u.id::text AS id, u.email, u.name, u.username,
       u."isSuspended", u."isShadowbanned",
       COALESCE(s."allowCollaborationInvites", true) AS allow_collab
FROM "User" u
LEFT JOIN "UserSettings" s ON s."userId" = u.id
WHERE u.id = $1;

-- name: UpsertCollaborationRequest :one
INSERT INTO "CollaborationRequest" (id, "articleId", "inviterId", "inviteeId", status,
                                    "requestedRole", "requestedOrder", "showOnPublicProfile",
                                    "acceptedAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, 'PENDING', $4, $5, false, NULL, now())
ON CONFLICT ("articleId", "inviteeId") DO UPDATE SET
  "inviterId" = $2, status = 'PENDING', "requestedRole" = $4, "requestedOrder" = $5,
  "showOnPublicProfile" = false, "acceptedAt" = NULL, "updatedAt" = now()
RETURNING id, "articleId", "inviterId"::text, "inviteeId"::text, status,
          "requestedRole", "requestedOrder", "showOnPublicProfile", "createdAt";

-- name: GetCollaborationRequestByID :one
SELECT id, "articleId", "inviterId"::text, "inviteeId"::text, status,
       "requestedRole", "requestedOrder", "showOnPublicProfile", "createdAt"
FROM "CollaborationRequest"
WHERE id = $1;

-- name: UpdateCollaborationRequestResponse :exec
UPDATE "CollaborationRequest"
SET status = $2, "showOnPublicProfile" = $3, "acceptedAt" = $4, "updatedAt" = now()
WHERE id = $1;

-- name: UpsertArticleAttribution :exec
INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible",
                                  "consentStatus", "consentUpdatedAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'ACCEPTED', now(), now())
ON CONFLICT ("articleId", "userId") DO UPDATE SET
  role = $3, "order" = $4, "isVisible" = $5, "consentStatus" = 'ACCEPTED',
  "consentUpdatedAt" = now(), "updatedAt" = now();

-- name: UpdateArticleAttributionConsent :exec
UPDATE "ArticleAttribution"
SET "consentStatus" = $3, "isVisible" = false, "consentUpdatedAt" = now(), "updatedAt" = now()
WHERE "articleId" = $1 AND "userId" = $2;

-- name: RevokeCollaborationRequestsForArticle :exec
UPDATE "CollaborationRequest"
SET status = 'REVOKED', "showOnPublicProfile" = false, "updatedAt" = now()
WHERE "articleId" = $1 AND "inviteeId" = $2;

-- name: InsertArticleContributorNotification :exec
-- Notification in-app (jamais perdue) : dédup par (recipient, sender, type,
-- articleId, non-lue) + pas d'auto-notification. Casts explicites : évite
-- l'ambiguïté uuid/text en protocole étendu (operator does not exist).
INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId")
SELECT gen_random_uuid()::text, $1::uuid, $2::uuid, $3::"NotificationType", $4::text
WHERE $1::uuid <> $2::uuid
  AND NOT EXISTS (
    SELECT 1 FROM "Notification" n
    WHERE n."recipientId" = $1::uuid AND n."senderId" = $2::uuid
      AND n.type = $3::"NotificationType" AND n."articleId" = $4::text
      AND n."isRead" = false
  );

-- name: ListReceivedCollaborationRequests :many
SELECT cr.id, cr."articleId", cr.status, cr."requestedRole", cr."requestedOrder",
       cr."showOnPublicProfile", cr."createdAt",
       a.title AS article_title, a.slug AS article_slug,
       u.id::text AS user_id, u.name AS user_name, u.email AS user_email, u.username AS user_username
FROM "CollaborationRequest" cr
JOIN "Article" a ON a.id = cr."articleId"
JOIN "User" u ON u.id = cr."inviterId"
WHERE cr."inviteeId" = $1
ORDER BY cr."createdAt" DESC;

-- name: ListSentCollaborationRequests :many
SELECT cr.id, cr."articleId", cr.status, cr."requestedRole", cr."requestedOrder",
       cr."showOnPublicProfile", cr."createdAt",
       a.title AS article_title, a.slug AS article_slug,
       u.id::text AS user_id, u.name AS user_name, u.email AS user_email, u.username AS user_username
FROM "CollaborationRequest" cr
JOIN "Article" a ON a.id = cr."articleId"
JOIN "User" u ON u.id = cr."inviteeId"
WHERE cr."inviterId" = $1
ORDER BY cr."createdAt" DESC;
