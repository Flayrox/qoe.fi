-- +goose Up
-- 🧹 Suppression du parcours d'invitation média par email.
-- Les invitations média se font désormais par @username (ajout direct du membre
-- + notification MEDIA_INVITE) ou par lien d'invitation révocable
-- ("MediaInviteLink"). Plus aucune adresse email n'est stockée ni comparée.
DROP TABLE IF EXISTS "MediaInvite" CASCADE;

-- +goose Down
CREATE TABLE IF NOT EXISTS "MediaInvite" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "inviterId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'writer',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MediaInvite_token_key" ON "MediaInvite"("token");
CREATE INDEX IF NOT EXISTS "MediaInvite_mediaId_idx" ON "MediaInvite"("mediaId");
CREATE INDEX IF NOT EXISTS "MediaInvite_email_idx" ON "MediaInvite"("email");
CREATE INDEX IF NOT EXISTS "MediaInvite_token_idx" ON "MediaInvite"("token");

ALTER TABLE "MediaInvite" ADD CONSTRAINT "MediaInvite_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaInvite" ADD CONSTRAINT "MediaInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
