-- +goose Up
-- Permissions fines de collaboration
ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "collaborationInvitePermission" TEXT NOT NULL DEFAULT 'EVERYONE';

-- Liens d'invitation pour les articles (co-rédaction & attributions)
CREATE TABLE IF NOT EXISTS "CollaborationInviteLink" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CO_AUTHOR',
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationInviteLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CollaborationInviteLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationInviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationInviteLink_token_key" ON "CollaborationInviteLink"("token");
CREATE INDEX IF NOT EXISTS "CollaborationInviteLink_articleId_idx" ON "CollaborationInviteLink"("articleId");
CREATE INDEX IF NOT EXISTS "CollaborationInviteLink_createdById_idx" ON "CollaborationInviteLink"("createdById");

-- Liens d'invitation pour les médias (rejoindre une équipe sans fuite d'email)
CREATE TABLE IF NOT EXISTS "MediaInviteLink" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'writer',
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaInviteLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaInviteLink_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaInviteLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MediaInviteLink_token_key" ON "MediaInviteLink"("token");
CREATE INDEX IF NOT EXISTS "MediaInviteLink_mediaId_idx" ON "MediaInviteLink"("mediaId");
CREATE INDEX IF NOT EXISTS "MediaInviteLink_createdById_idx" ON "MediaInviteLink"("createdById");

-- +goose Down
DROP TABLE IF EXISTS "MediaInviteLink";
DROP TABLE IF EXISTS "CollaborationInviteLink";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "collaborationInvitePermission";
