-- =====================================================================
-- 🛡️ Résilience webhooks & registre comms complet (Lots P5 / P1)
-- =====================================================================
-- 1. Type de notification SYSTEM_ALERT pour prévenir le propriétaire d'une
--    publication lorsqu'un webhook est désactivé après N échecs consécutifs.
-- 2. Colonnes de suivi des pannes sur "Webhook" (compteur atomique, motif et
--    horodatage de désactivation automatique).
-- 3. Complément du registre "MessageTypePolicy" pour tous les flux gérés par
--    la passerelle comms.Gateway.
-- =====================================================================

-- +goose NO TRANSACTION

-- +goose Up
SET lock_timeout = '3s';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ALERT';

ALTER TABLE "Webhook"
    ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "disabledReason"      TEXT,
    ADD COLUMN IF NOT EXISTS "disabledAt"          TIMESTAMP(3);

INSERT INTO "MessageTypePolicy" ("key", "family", "owner", "baseRule", "priority", "tracking", "staffApproval", "description", "updatedAt") VALUES
    ('newsletter.article_published', 'newsletter', 'newsletters', 'opt_in', 100, 'none', false,
     'Diffusion automatique par e-mail lors de la publication d''un article.', now()),
    ('staff.campaign', 'staff', 'admin', 'approval', 30, 'none', true,
     'Campagne ciblée envoyée par le staff avec approbation préalable.', now()),
    ('import.reconfirm', 'newsletter', 'newsletters', 'opt_in', 50, 'none', false,
     'Demande de reconfirmation d''un lot d''abonnés importés.', now()),
    ('security.alert', 'security', 'auth', 'always', 0, 'none', false,
     'Alerte de sécurité critique (connexion, mot de passe, MFA, quarantaine).', now()),
    ('webhook.disabled', 'service', 'webhooks', 'always', 10, 'none', false,
     'Notification critique adressée au propriétaire après désactivation d''un webhook.', now())
ON CONFLICT ("key") DO NOTHING;

-- +goose Down
SET lock_timeout = '3s';

DELETE FROM "MessageTypePolicy"
WHERE "key" IN (
    'newsletter.article_published',
    'staff.campaign',
    'import.reconfirm',
    'security.alert',
    'webhook.disabled'
);

ALTER TABLE "Webhook"
    DROP COLUMN IF EXISTS "disabledAt",
    DROP COLUMN IF EXISTS "disabledReason",
    DROP COLUMN IF EXISTS "consecutiveFailures";
-- Les valeurs ajoutées à un enum Postgres ("NotificationType") ne peuvent pas être retirées.
