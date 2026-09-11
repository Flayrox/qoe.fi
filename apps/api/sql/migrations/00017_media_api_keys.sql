-- +goose Up
-- Migration 00017_media_api_keys.sql
-- Support des clés API pour les médias / workspaces.
-- Une clé est possédée soit par un User (clé personnelle créateur existante),
-- soit par une Publication (clé de média), strictement en XOR.
-- createdByUserId conserve l'auteur humain de la création pour l'audit.

-- 1. Rendre userId nullable pour autoriser les clés possédées par une publication
ALTER TABLE "ApiKey" ALTER COLUMN "userId" DROP NOT NULL;

-- 2. Ajouter publicationId et createdByUserId
ALTER TABLE "ApiKey" ADD COLUMN "publicationId" TEXT REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD COLUMN "createdByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Backfill createdByUserId pour les clés personnelles existantes
UPDATE "ApiKey" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL AND "userId" IS NOT NULL;

-- 4. Contrainte XOR garantissant exactement un seul propriétaire (userId XOR publicationId)
ALTER TABLE "ApiKey" ADD CONSTRAINT "chk_apikey_single_owner" CHECK (
    ("userId" IS NOT NULL AND "publicationId" IS NULL) OR
    ("userId" IS NULL AND "publicationId" IS NOT NULL)
);

-- 5. Index pour les recherches par publication et par créateur
CREATE INDEX "ApiKey_publicationId_idx" ON "ApiKey"("publicationId");
CREATE INDEX "ApiKey_createdByUserId_idx" ON "ApiKey"("createdByUserId");

-- +goose Down
DROP INDEX IF EXISTS "ApiKey_createdByUserId_idx";
DROP INDEX IF EXISTS "ApiKey_publicationId_idx";
ALTER TABLE "ApiKey" DROP CONSTRAINT IF EXISTS "chk_apikey_single_owner";
DELETE FROM "ApiKey" WHERE "userId" IS NULL;
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "createdByUserId";
ALTER TABLE "ApiKey" DROP COLUMN IF EXISTS "publicationId";
ALTER TABLE "ApiKey" ALTER COLUMN "userId" SET NOT NULL;
