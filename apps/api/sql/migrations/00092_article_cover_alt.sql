-- =====================================================================
-- 🖼️ Migration 00092 : description alternative de la couverture
-- =====================================================================
-- B4 : le reader utilisait le titre de l'article comme alt de couverture,
-- ce qui est faux pour une image décorative et inutilement redondant pour
-- une photo. Deux colonnes additives conservent le comportement historique
-- (alt vide + non décorative → repli sur le titre) tout en permettant un
-- vrai alt ou une couverture explicitement décorative.
-- =====================================================================

-- +goose Up
ALTER TABLE "Article"
    ADD COLUMN IF NOT EXISTS "coverAlt" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "coverDecorative" BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE "Article"
    DROP COLUMN IF EXISTS "coverDecorative",
    DROP COLUMN IF EXISTS "coverAlt";
