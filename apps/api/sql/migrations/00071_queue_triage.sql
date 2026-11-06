-- =====================================================================
-- 🧭 Triage uniforme des files staff
-- =====================================================================
-- Chaque file garde sa propre machine à états : cette migration n'ajoute
-- AUCUN statut, aucune table Task générique. Elle ajoute à chaque table de
-- file les mêmes quatre champs de triage :
--
--   • assignedTo       : la personne qui instruit le dossier (NULL = libre) ;
--   • priority         : low | normal | high | urgent ;
--   • dueAt            : l'échéance SLA choisie (NULL = échéance par défaut
--                        calculée depuis la création, selon la file) ;
--   • triageUpdatedAt / triageUpdatedBy : qui a bougé le triage, quand.
--
-- L'état SLA n'est PAS stocké : il se dérive de dueAt et de l'état ouvert du
-- dossier. Stocker un « breached » figé obligerait à le recalculer par un
-- balayage ; une valeur dérivée ne peut pas mentir.
--
-- Les six files : signalements, recours, anti-abus (dernier verdict par
-- sujet), support, imports d'abonnés, doubles validations.
-- =====================================================================

-- +goose Up

-- +goose StatementBegin
ALTER TABLE "ModerationReport"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "Appeal"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- +goose StatementBegin
-- L'anti-abus est un dossier par sujet : le triage vit sur le dernier verdict
-- qui matérialise ce dossier (un nouveau verdict rouvre un dossier neuf).
ALTER TABLE "RiskDecision"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "SupportTicket"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "SubscriberImportBatch"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminApproval"
    ADD COLUMN IF NOT EXISTS "assignedTo" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triageUpdatedBy" UUID;
-- +goose StatementEnd

-- Vocabulaire fermé de la priorité, identique dans les six files.
-- +goose StatementBegin
ALTER TABLE "ModerationReport" DROP CONSTRAINT IF EXISTS "ModerationReport_priority_check";
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "Appeal" DROP CONSTRAINT IF EXISTS "Appeal_priority_check";
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "RiskDecision" DROP CONSTRAINT IF EXISTS "RiskDecision_priority_check";
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_priority_check";
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "SubscriberImportBatch" DROP CONSTRAINT IF EXISTS "SubscriberImportBatch_priority_check";
ALTER TABLE "SubscriberImportBatch" ADD CONSTRAINT "SubscriberImportBatch_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE "AdminApproval" DROP CONSTRAINT IF EXISTS "AdminApproval_priority_check";
ALTER TABLE "AdminApproval" ADD CONSTRAINT "AdminApproval_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS "ModerationReport_triage_idx" ON "ModerationReport" ("assignedTo", "dueAt");
CREATE INDEX IF NOT EXISTS "Appeal_triage_idx" ON "Appeal" ("assignedTo", "dueAt");
CREATE INDEX IF NOT EXISTS "RiskDecision_triage_idx" ON "RiskDecision" ("assignedTo", "dueAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_triage_idx" ON "SupportTicket" ("assignedTo", "dueAt");
CREATE INDEX IF NOT EXISTS "SubscriberImportBatch_triage_idx" ON "SubscriberImportBatch" ("assignedTo", "dueAt");
CREATE INDEX IF NOT EXISTS "AdminApproval_triage_idx" ON "AdminApproval" ("assignedTo", "dueAt");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "AdminApproval_triage_idx";
DROP INDEX IF EXISTS "SubscriberImportBatch_triage_idx";
DROP INDEX IF EXISTS "SupportTicket_triage_idx";
DROP INDEX IF EXISTS "RiskDecision_triage_idx";
DROP INDEX IF EXISTS "Appeal_triage_idx";
DROP INDEX IF EXISTS "ModerationReport_triage_idx";
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminApproval" DROP CONSTRAINT IF EXISTS "AdminApproval_priority_check";
ALTER TABLE "SubscriberImportBatch" DROP CONSTRAINT IF EXISTS "SubscriberImportBatch_priority_check";
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_priority_check";
ALTER TABLE "RiskDecision" DROP CONSTRAINT IF EXISTS "RiskDecision_priority_check";
ALTER TABLE "Appeal" DROP CONSTRAINT IF EXISTS "Appeal_priority_check";
ALTER TABLE "ModerationReport" DROP CONSTRAINT IF EXISTS "ModerationReport_priority_check";
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminApproval"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
ALTER TABLE "SubscriberImportBatch"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
ALTER TABLE "SupportTicket"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
ALTER TABLE "RiskDecision"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
ALTER TABLE "Appeal"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
ALTER TABLE "ModerationReport"
    DROP COLUMN IF EXISTS "triageUpdatedBy", DROP COLUMN IF EXISTS "triageUpdatedAt",
    DROP COLUMN IF EXISTS "dueAt", DROP COLUMN IF EXISTS "priority", DROP COLUMN IF EXISTS "assignedTo";
-- +goose StatementEnd
