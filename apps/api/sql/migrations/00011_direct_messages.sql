-- =====================================================================
-- 💬 Messagerie directe (DMs) : conversations, membres, messages.
-- =====================================================================
-- Tranche 1 : conversations directes (2 participants). Le modèle est déjà
-- prêt pour les groupes futurs (type sur Conversation, N membres) — seule
-- la résolution déterministe (directKey) est propre au cas direct.
--
-- directKey : « minId:maxId » des deux participants, triés — garantit UNE
-- conversation par paire (INSERT ... ON CONFLICT atomique, pas de doublon
-- sous concurrence). NULL pour les futurs groupes.
--
-- Lecture : lastReadAt par membre (ConversationMember) ; un message est
-- « non lu » s'il est postérieur au dernier marquage lu du membre.

-- +goose Up

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'direct',
    "directKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Conversation_directKey_key" UNIQUE ("directKey")
);

CREATE TABLE "ConversationMember" (
    "conversationId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId", "userId")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Index de listing : messages d'une conversation triés par ancienneté.
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message" ("conversationId", "createdAt");

-- Index de listing : conversations d'un utilisateur (membres).
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember" ("userId");

-- Comptage des non-lus par membre : couverture (conversationId, userId).
CREATE INDEX "ConversationMember_conversationId_userId_idx"
    ON "ConversationMember" ("conversationId", "userId");

ALTER TABLE "ConversationMember"
    ADD CONSTRAINT "ConversationMember_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationMember"
    ADD CONSTRAINT "ConversationMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
    ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
    ADD CONSTRAINT "Message_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- +goose Down

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_senderId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_conversationId_fkey";
ALTER TABLE "ConversationMember" DROP CONSTRAINT IF EXISTS "ConversationMember_userId_fkey";
ALTER TABLE "ConversationMember" DROP CONSTRAINT IF EXISTS "ConversationMember_conversationId_fkey";

DROP INDEX IF EXISTS "ConversationMember_conversationId_userId_idx";
DROP INDEX IF EXISTS "ConversationMember_userId_idx";
DROP INDEX IF EXISTS "Message_conversationId_createdAt_idx";

DROP TABLE IF EXISTS "Message";
DROP TABLE IF EXISTS "ConversationMember";
DROP TABLE IF EXISTS "Conversation";