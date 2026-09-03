-- =====================================================================
-- 🎯 Ancres canoniques : surlignages ancrés par offsets dans le document
-- canonique de l'article (voir internal/canon) + empreinte de contenu.
-- =====================================================================
-- Le modèle historique {text, quoteOrdinal} reste en place (back-compat) :
-- les nouvelles colonnes sont ADDITIVES, jamais cassantes. Une ancre vaut
-- pour un contentSha donné ; sha différent à la lecture → ré-ancrage.
--
-- canonicalStart / canonicalEnd : offsets en CODE POINTS (scalaires
-- Unicode) dans le texte canonique plat de l'article (canon.Document.Text).
-- NULL tant que le surlignage n'a pas été résolu (données héritées).

-- +goose Up

ALTER TABLE "Highlight"
    ADD COLUMN IF NOT EXISTS "canonicalStart" INTEGER,
    ADD COLUMN IF NOT EXISTS "canonicalEnd"   INTEGER,
    ADD COLUMN IF NOT EXISTS "contentSha"     TEXT;

ALTER TABLE "Article"
    ADD COLUMN IF NOT EXISTS "contentSha" TEXT;

-- +goose Down

ALTER TABLE "Highlight"
    DROP COLUMN IF EXISTS "canonicalStart",
    DROP COLUMN IF EXISTS "canonicalEnd",
    DROP COLUMN IF EXISTS "contentSha";

ALTER TABLE "Article"
    DROP COLUMN IF EXISTS "contentSha";
