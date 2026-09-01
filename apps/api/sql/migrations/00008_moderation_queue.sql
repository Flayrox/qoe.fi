-- =====================================================================
-- 🛡️ File de modération : signalements exploitables par le superadmin
-- =====================================================================
-- Les signalements (ModerationReport) deviennent une vraie file : statut
-- résolu + résolveur, note de décision et action prise (masquage du post /
-- de l'article, suspension de l'auteur). Le contenu masqué par un
-- modérateur est filtré des flux (isHiddenByModerator, distinct du
-- soft-delete de l'auteur). Un index unique partiel empêche un même
-- utilisateur de signaler deux fois la même cible tant qu'il est pending.

-- +goose Up

-- Contenu masqué par la modération (takedown réversible).
ALTER TABLE "Post"
    ADD COLUMN IF NOT EXISTS "isHiddenByModerator" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "hiddenByModeratorAt" TIMESTAMP(3);

ALTER TABLE "Article"
    ADD COLUMN IF NOT EXISTS "isHiddenByModerator" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "hiddenByModeratorAt" TIMESTAMP(3);

-- Résolution d'un signalement.
ALTER TABLE "ModerationReport"
    ADD COLUMN IF NOT EXISTS "resolvedById" UUID,
    ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT,
    ADD COLUMN IF NOT EXISTS "actionTaken" TEXT NOT NULL DEFAULT 'none';

-- Dédup : un même reporter ne peut pas avoir deux signalements pending
-- sur la même cible.
CREATE UNIQUE INDEX IF NOT EXISTS "ModerationReport_reporter_target_pending_key"
    ON "ModerationReport"("reporterId", "targetId", "targetType")
    WHERE status = 'pending';

-- +goose Down
DROP INDEX IF EXISTS "ModerationReport_reporter_target_pending_key";

ALTER TABLE "ModerationReport"
    DROP COLUMN IF EXISTS "resolvedById",
    DROP COLUMN IF EXISTS "resolvedAt",
    DROP COLUMN IF EXISTS "resolutionNote",
    DROP COLUMN IF EXISTS "actionTaken";

ALTER TABLE "Article"
    DROP COLUMN IF EXISTS "isHiddenByModerator",
    DROP COLUMN IF EXISTS "hiddenByModeratorAt";

ALTER TABLE "Post"
    DROP COLUMN IF EXISTS "isHiddenByModerator",
    DROP COLUMN IF EXISTS "hiddenByModeratorAt";
