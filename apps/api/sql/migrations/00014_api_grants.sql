-- =====================================================================
-- 🎛️ Permissions d'accès API modulables : grants par créateur
-- =====================================================================
-- L'accès API n'est plus binaire (approuvé / refusé) : l'admin accorde un
-- sous-ensemble de permissions (API entrante lecture/écriture/analytics,
-- API sortante webhooks, OAuth) lors de l'approbation, et peut les ajuster
-- à tout moment (User.apiGrants).
--
-- Les créateurs déjà approuvés sont grandfatherés : ils reçoivent toutes
-- les permissions, pour ne rien casser à la migration.

-- +goose Up

ALTER TABLE "User" ADD COLUMN "apiGrants" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "User"
SET "apiGrants" = ARRAY['api:read', 'api:write', 'api:analytics', 'webhooks', 'oauth']
WHERE "apiAccessStatus" = 'approved';

-- +goose Down

ALTER TABLE "User" DROP COLUMN IF EXISTS "apiGrants";