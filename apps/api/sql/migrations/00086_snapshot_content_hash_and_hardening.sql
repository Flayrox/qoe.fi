-- =====================================================================
-- 🛡️ Migration 00086 : Empreinte contentHash sur ArticleSnapshot +
--                        index anti-sybil sur Follows
-- =====================================================================
-- 1. Colonne `contentHash` sur `ArticleSnapshot` pour la déduplication
--    SHA-256 avant insertion (évite la saturation sur sauvegarde répétée).
-- 2. Index `ArticleSnapshot(articleId, reason, createdAt DESC)` pour le
--    cooldown `AUTHOR_SWITCH` et l'élagage > 50 snapshots.
-- 3. Index `Follows(createdAt DESC, publisherId)` pour l'audit périodique
--    léger des anneaux de follow mutuel.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
ALTER TABLE "ArticleSnapshot"
    ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE INDEX IF NOT EXISTS "ArticleSnapshot_articleId_reason_createdAt_idx"
    ON "ArticleSnapshot" ("articleId", "reason", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Follows_createdAt_publisherId_idx"
    ON "Follows" ("createdAt" DESC, "publisherId");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "Follows_createdAt_publisherId_idx";
DROP INDEX IF EXISTS "ArticleSnapshot_articleId_reason_createdAt_idx";
ALTER TABLE "ArticleSnapshot" DROP COLUMN IF EXISTS "contentHash";
-- +goose StatementEnd
