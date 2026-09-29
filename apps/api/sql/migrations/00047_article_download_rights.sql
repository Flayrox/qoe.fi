-- =====================================================================
-- 📥 Droits de téléchargement auteur (fiche Plus P1 : hors-ligne)
-- =====================================================================
-- L'auteur choisit si son contenu peut être mis hors-ligne / exporté
-- (fiche Plus : consentement auteur — jamais de téléchargement contre son
-- gré). Deux niveaux, même pattern que allowPublicAnnotations :
--   - Publication.allowDownloadDefault : défaut appliqué À LA CRÉATION ;
--   - Article.allowDownload : l'article prime (modifiable à tout moment).
-- Défaut true les deux (opt-out) : comportement actuel préservé, aucune
-- rupture — l'auteur qui veut restreindre le dit explicitement.
-- Le pack hors-ligne (Plus) vérifie l'article ; la file d'écoute aussi.
--
-- +goose Up
-- +goose StatementBegin
ALTER TABLE "Publication"
    ADD COLUMN IF NOT EXISTS "allowDownloadDefault" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Article"
    ADD COLUMN IF NOT EXISTS "allowDownload" BOOLEAN NOT NULL DEFAULT true;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "Article"
    DROP COLUMN IF EXISTS "allowDownload";
ALTER TABLE "Publication"
    DROP COLUMN IF EXISTS "allowDownloadDefault";
-- +goose StatementEnd
