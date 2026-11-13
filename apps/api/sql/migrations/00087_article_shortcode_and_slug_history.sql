-- =====================================================================
-- Migration 00087 : Code court numérique ("shortCode") sur Article
-- =====================================================================
-- 1. Colonne "shortCode" TEXT sur "Article" (lock_timeout 3s).
-- 2. Backfill des articles existants sans shortCode avec un code
--    numérique unique (6 chiffres 100000..999999, repli 7 chiffres,
--    ne commençant jamais par 0, sans collision).
-- 3. Index unique concurrent "Article_shortCode_key" sur "shortCode".
-- =====================================================================

-- +goose NO TRANSACTION

-- +goose Up
SET lock_timeout = '3s';
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;

-- +goose StatementBegin
DO $$
DECLARE
    rec RECORD;
    candidate TEXT;
    attempts INT;
BEGIN
    FOR rec IN SELECT id FROM "Article" WHERE "shortCode" IS NULL LOOP
        attempts := 0;
        LOOP
            attempts := attempts + 1;
            IF attempts <= 20 THEN
                candidate := (100000 + floor(random() * 900000))::int::text;
            ELSE
                candidate := (1000000 + floor(random() * 9000000))::int::text;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM "Article" WHERE "shortCode" = candidate) THEN
                UPDATE "Article" SET "shortCode" = candidate WHERE id = rec.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;
-- +goose StatementEnd

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Article_shortCode_key"
    ON "Article" ("shortCode");

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS "Article_shortCode_key";
SET lock_timeout = '3s';
ALTER TABLE "Article" DROP COLUMN IF EXISTS "shortCode";
