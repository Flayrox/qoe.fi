-- Messagerie directe : conversations (tranche 1 — direct à 2 participants).
-- Tables : Conversation, ConversationMember.
-- La paire (conversationId, userId) est la clé de ConversationMember : chaque
-- membre a son lastReadAt. directKey = « minId:maxId » triés (une seule
-- conversation par paire, création atomique via ON CONFLICT).

-- name: InsertDirectConversation :one
-- Crée la conversation directe si elle n'existe pas (idempotent).
INSERT INTO "Conversation" (id, "directKey")
VALUES (gen_random_uuid()::text, $1)
ON CONFLICT ("directKey") DO NOTHING
RETURNING id;

-- name: GetConversationByDirectKey :one
SELECT id
FROM "Conversation"
WHERE "directKey" = $1;

-- name: UpsertConversationMember :exec
-- Ajoute un membre s'il manque (conversation existante re-ouverte).
INSERT INTO "ConversationMember" ("conversationId", "userId")
VALUES ($1, $2)
ON CONFLICT ("conversationId", "userId") DO NOTHING;

-- name: UserExists :one
SELECT EXISTS(SELECT 1 FROM "User" WHERE id = $1);

-- name: AreUsersBlocked :one
-- Vrai si l'un des deux a bloqué l'autre (les deux sens).
SELECT EXISTS(
    SELECT 1 FROM "BlockedUser"
    WHERE ("creatorId" = $1 AND "readerId" = $2)
       OR ("creatorId" = $2 AND "readerId" = $1)
);

-- name: ListConversationsForUser :many
-- Conversations de l'utilisateur (directes : un seul autre participant),
-- avec le dernier message et le nombre de non-lus, triées par activité.
SELECT c.id, c."createdAt",
       u.id::text AS participant_id,
       u.name     AS participant_name,
       u.username AS participant_username,
       u."logoUrl" AS participant_logo,
       u."isCertified" AS participant_certified,
       m."lastReadAt",
       (SELECT COUNT(*)::int FROM "Message" msg
        WHERE msg."conversationId" = c.id
          AND msg."senderId" <> m."userId"
          AND (m."lastReadAt" IS NULL OR msg."createdAt" > m."lastReadAt")) AS unread_count,
       COALESCE(lm.id, '') AS last_message_id,
       COALESCE(lm.content, '') AS last_message_content,
       COALESCE(lm."senderId"::text, '')::text AS last_message_sender_id,
       lm."createdAt" AS last_message_at
FROM "ConversationMember" m
JOIN "Conversation" c ON c.id = m."conversationId"
JOIN "ConversationMember" other ON other."conversationId" = c.id AND other."userId" <> $1
JOIN "User" u ON u.id = other."userId"
LEFT JOIN LATERAL (
    SELECT id, content, "senderId", "createdAt"
    FROM "Message"
    WHERE "conversationId" = c.id
    ORDER BY "createdAt" DESC, id DESC
    LIMIT 1
) lm ON true
WHERE m."userId" = $1
ORDER BY COALESCE(lm."createdAt", c."createdAt") DESC
LIMIT $2;

-- name: GetConversationForUser :one
-- Détail d'une conversation (vérifie l'appartenance + résout l'autre participant).
SELECT c.id, c."createdAt", m."lastReadAt",
       u.id::text AS participant_id,
       u.name     AS participant_name,
       u.username AS participant_username,
       u."logoUrl" AS participant_logo,
       u."isCertified" AS participant_certified
FROM "ConversationMember" m
JOIN "Conversation" c ON c.id = m."conversationId"
JOIN "ConversationMember" other ON other."conversationId" = c.id AND other."userId" <> $1
JOIN "User" u ON u.id = other."userId"
WHERE m."userId" = $1 AND c.id = $2;

-- name: CountUnreadConversations :one
-- Nombre de conversations avec au moins un message non lu (badge tab).
-- Les messages que l'on a SOI-MÊME envoyés ne comptent jamais comme non-lus ;
-- COUNT(DISTINCT conversation) : plusieurs messages ≠ plusieurs badges.
SELECT COUNT(DISTINCT m."conversationId")::int AS count
FROM "ConversationMember" m
JOIN "Message" msg ON msg."conversationId" = m."conversationId"
WHERE m."userId" = $1
  AND msg."senderId" <> m."userId"
  AND (m."lastReadAt" IS NULL OR msg."createdAt" > m."lastReadAt");

-- name: MarkConversationRead :exec
-- Marque TOUS les messages comme lus (upsert du lastReadAt à maintenant).
INSERT INTO "ConversationMember" ("conversationId", "userId", "lastReadAt")
VALUES ($1, $2, now())
ON CONFLICT ("conversationId", "userId")
DO UPDATE SET "lastReadAt" = now();