-- =====================================================================
-- 🧹 Migration 00089 : index de rétention sur ReadingSession."createdAt"
-- =====================================================================
-- La purge des sessions de lecture (> 90 jours) n'est plus faite sur le
-- chemin chaud du tracking : elle est assurée par le worker
-- (workers.RunReadingSessionRetention), par lots bornés.
--
-- Cet index rend la sélection des lignes expirées indexable : tous les index
-- existants ont une autre colonne en tête (userId, articleId, anonHash), donc
-- `WHERE "createdAt" < $1` faisait un scan complet de la table.
-- =====================================================================

-- +goose NO TRANSACTION
-- +goose Up
SET lock_timeout = '3s';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReadingSession_createdAt_idx"
    ON "ReadingSession" ("createdAt");

-- +goose Down
SET lock_timeout = '3s';

DROP INDEX CONCURRENTLY IF EXISTS "ReadingSession_createdAt_idx";
