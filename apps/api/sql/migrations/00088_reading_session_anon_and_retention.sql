-- =====================================================================
-- 📊 Migration 00088 : ReadingSession anonyme (anonHash) & rétention 90j
-- =====================================================================
-- 1. Rend "ReadingSession"."userId" nullable (au cas où la contrainte NOT NULL
--    existerait encore en base) afin d'enregistrer les lectures anonymes
--    sur *.qoe.fi et custom domains.
-- 2. Ajoute "anonHash" TEXT (hash journalier HMAC SHA-256 sans cookie ni PII).
-- 3. Index partiel CONCURRENTLY sur ("anonHash", "createdAt") pour les
--    comptages de visiteurs uniques sur 30j/90j.
-- =====================================================================

-- +goose NO TRANSACTION
-- +goose Up
SET lock_timeout = '3s';

ALTER TABLE "ReadingSession" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ReadingSession" ADD COLUMN IF NOT EXISTS "anonHash" TEXT;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReadingSession_anonHash_createdAt_idx"
    ON "ReadingSession" ("anonHash", "createdAt")
    WHERE "anonHash" IS NOT NULL;

-- +goose Down
SET lock_timeout = '3s';

DROP INDEX CONCURRENTLY IF EXISTS "ReadingSession_anonHash_createdAt_idx";
-- allow-destructive-drop
ALTER TABLE "ReadingSession" DROP COLUMN IF EXISTS "anonHash";
