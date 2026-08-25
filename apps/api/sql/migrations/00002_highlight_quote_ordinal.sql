-- =====================================================================
-- 🖍️ Ancre d'occurrence pour les surlignages (déduplication de citations)
-- =====================================================================
-- L'ancre d'un surlignage est le texte cité. Quand le même passage
-- apparaît plusieurs fois dans un article, quoteOrdinal indique QUELLE
-- occurrence surligner (0 = première). Le moteur de rendu retombe sur la
-- première occurrence si l'ordinal demandé n'existe plus (contenu édité).
-- =====================================================================

-- +goose Up
ALTER TABLE "Highlight" ADD COLUMN "quoteOrdinal" integer NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE "Highlight" DROP COLUMN "quoteOrdinal";
