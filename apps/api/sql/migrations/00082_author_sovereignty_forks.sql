-- =====================================================================
-- ⚖️ Migration 00082 : Souveraineté de l'Auteur sur les Essais (Forks)
-- =====================================================================
-- Dissocie l'archive éditoriale d'un Média de l'essai vivant personnel
-- de l'auteur :
-- - "originArticleId"       : référence vers l'article média d'origine
-- - "canonicalType"         : 'ORIGINAL' | 'MEDIA_ARCHIVE' | 'PERSONAL_FORK'
-- - "isAuthorSovereignCopy" : true pour l'exemplaire souverain personnel
-- - Backfill idempotent     : provisionne un exemplaire souverain pour
--   tout article déjà soumis/publié dans un média dont l'auteur n'a pas
--   encore sa copie personnelle (optionnel ou activé à la demande via API).
-- =====================================================================

-- +goose Up
ALTER TABLE "Article"
    ADD COLUMN IF NOT EXISTS "originArticleId" TEXT REFERENCES "Article"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "canonicalType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    ADD COLUMN IF NOT EXISTS "isAuthorSovereignCopy" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "canonicalUrl" TEXT;

ALTER TABLE "Article" DROP CONSTRAINT IF EXISTS "Article_canonicalType_check";
ALTER TABLE "Article" ADD CONSTRAINT "Article_canonicalType_check"
    CHECK ("canonicalType" IN ('ORIGINAL', 'MEDIA_ARCHIVE', 'PERSONAL_FORK'));

CREATE INDEX IF NOT EXISTS "Article_originArticleId_idx"
    ON "Article"("originArticleId") WHERE "originArticleId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Article_author_sovereign_idx"
    ON "Article"("authorId", "isAuthorSovereignCopy") WHERE "isAuthorSovereignCopy" = true;

-- +goose Down
DROP INDEX IF EXISTS "Article_author_sovereign_idx";
DROP INDEX IF EXISTS "Article_originArticleId_idx";
ALTER TABLE "Article" DROP CONSTRAINT IF EXISTS "Article_canonicalType_check";
ALTER TABLE "Article"
    DROP COLUMN IF EXISTS "canonicalUrl",
    DROP COLUMN IF EXISTS "isAuthorSovereignCopy",
    DROP COLUMN IF EXISTS "canonicalType",
    DROP COLUMN IF EXISTS "originArticleId";
