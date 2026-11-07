-- =====================================================================
-- 00075_follow_requests.sql — comptes privés : demandes d'abonnement
-- =====================================================================
-- Un compte PRIVATE n'accepte plus les follows instantanés : la demande
-- attend une décision du propriétaire. FOLLOWERS reste instantané (l'accès
-- au contenu est simplement réservé aux abonnés).
-- =====================================================================

-- +goose Up
CREATE TABLE IF NOT EXISTS "FollowRequest" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "requesterId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "publicationId" TEXT NOT NULL REFERENCES "Publication"("id") ON DELETE CASCADE,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "FollowRequest_status_check"
        CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);

-- Une seule demande en attente par couple (demandeur, publication).
CREATE UNIQUE INDEX IF NOT EXISTS "FollowRequest_pending_key"
    ON "FollowRequest"("requesterId", "publicationId")
    WHERE "status" = 'PENDING';

-- Boîte de réception du propriétaire : les demandes pending, récentes d'abord.
CREATE INDEX IF NOT EXISTS "FollowRequest_publication_pending_idx"
    ON "FollowRequest"("publicationId", "createdAt" DESC)
    WHERE "status" = 'PENDING';

-- Un demandeur retrouve et annule sa demande sans balayer la table.
CREATE INDEX IF NOT EXISTS "FollowRequest_requester_status_idx"
    ON "FollowRequest"("requesterId", "status");

-- Le blocage est désormais vérifié dans les deux sens (viewer → auteur et
-- auteur → viewer) : l'index existant (creatorId, readerId) ne couvre que le
-- premier sens. Ajout du sens inverse pour éviter un seq scan sur les feeds.
CREATE INDEX IF NOT EXISTS "BlockedUser_readerId_creatorId_idx"
    ON "BlockedUser"("readerId", "creatorId");

-- +goose Down
DROP INDEX IF EXISTS "BlockedUser_readerId_creatorId_idx";
DROP TABLE IF EXISTS "FollowRequest";
