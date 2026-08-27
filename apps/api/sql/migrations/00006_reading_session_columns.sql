-- =====================================================================
-- 🔁 Réconciliation ReadingSession (drift schéma backup Aug-22)
-- =====================================================================
-- La base restaurée (dump du 22 août) a été captée avant l'ajout des
-- colonnes hostname / referrerUsername. Le code courant (seed RunTop,
-- tracking) les utilise. On les ajoute si absentes — idempotent, sans
-- casser une table qui les aurait déjà.

-- +goose Up
ALTER TABLE "ReadingSession"
    ADD COLUMN IF NOT EXISTS "hostname" TEXT,
    ADD COLUMN IF NOT EXISTS "referrerUsername" TEXT;

-- +goose Down
ALTER TABLE "ReadingSession"
    DROP COLUMN IF EXISTS "hostname",
    DROP COLUMN IF EXISTS "referrerUsername";