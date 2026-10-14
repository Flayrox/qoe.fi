-- =====================================================================
-- 00061_publication_site_options.sql — Options d'affichage du site
-- =====================================================================
-- Permet de cocher / décocher les composants et blocs visibles :
-- showBanner, showLogo, showTagline, showSubscribeButton, showSocialLinks,
-- showCraftIndex, showProgressiveBlur, showNewsletterWall, etc.
-- =====================================================================

-- +goose Up
ALTER TABLE "Publication"
  ADD COLUMN IF NOT EXISTS "siteOptions" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE "Publication"
  DROP COLUMN IF EXISTS "siteOptions";
