-- =====================================================================
-- 🔒 Visibilité publique des likes
-- =====================================================================
-- Un like reste compté pour préserver les métriques, mais son auteur n'est
-- renvoyé dans aucune liste publique de likers lorsque la préférence est
-- PRIVATE. La valeur par défaut PUBLIC préserve le comportement existant.

-- +goose Up
ALTER TABLE "UserSettings"
    ADD COLUMN IF NOT EXISTS "likeVisibility" TEXT NOT NULL DEFAULT 'PUBLIC';

UPDATE "UserSettings"
SET "likeVisibility" = 'PUBLIC'
WHERE "likeVisibility" IS NULL
   OR "likeVisibility" NOT IN ('PUBLIC', 'PRIVATE');

ALTER TABLE "UserSettings"
    DROP CONSTRAINT IF EXISTS "UserSettings_likeVisibility_check";

ALTER TABLE "UserSettings"
    ADD CONSTRAINT "UserSettings_likeVisibility_check"
    CHECK ("likeVisibility" IN ('PUBLIC', 'PRIVATE'));

-- +goose Down
ALTER TABLE "UserSettings"
    DROP CONSTRAINT IF EXISTS "UserSettings_likeVisibility_check";

ALTER TABLE "UserSettings"
    DROP COLUMN IF EXISTS "likeVisibility";
