-- =====================================================================
-- 00063_feature_signal_retention.sql — Index de rétention & d'agrégat
-- =====================================================================
-- "FeatureSignal" est purgée au-delà de 180 jours (service Go, au plus une
-- fois par jour). Sans index sur "createdAt", chaque purge balaierait la
-- table. L'agrégat analytics (90 j par publication) mérite lui aussi son
-- index composite plutôt qu'un tri complet.
-- =====================================================================

-- +goose Up
CREATE INDEX IF NOT EXISTS "FeatureSignal_created_idx"
    ON "FeatureSignal" ("createdAt");

CREATE INDEX IF NOT EXISTS "FeatureSignal_publication_created_idx"
    ON "FeatureSignal" ("publicationId", "createdAt" DESC);

-- +goose Down
DROP INDEX IF EXISTS "FeatureSignal_publication_created_idx";
DROP INDEX IF EXISTS "FeatureSignal_created_idx";
