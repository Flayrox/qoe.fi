-- =====================================================================
-- 🛡️ Anti-abus : shadowban motivé et budgets atomiques (fiche 06)
-- =====================================================================
-- Deux constats avant cette migration :
--   1. `isShadowbanned` est un booléen posé sans motif ni fin, qui exclut de
--      tous les flux de façon invisible — exactement le « shadowban opaque »
--      que la fiche 06 §6 interdit comme raccourci de modération. Désormais
--      toute mise en shadowban exige un motif et une échéance, et l'échéance
--      lève automatiquement la mesure.
--   2. Les e-mails de confirmation partent sans budget durable : seul un
--      rate-limit Redis volatil les borne. Un redémarrage, une autre route ou
--      des comptes multiples contournaient le plafond — et avec lui la
--      protection contre le harcèlement par demandes de confirmation
--      (fiches 01 §5, 06 P0). `CapabilityBudget` rend ces plafonds atomiques,
--      persistants et partagés quelle que soit la voie d'entrée.
--
-- +goose Up
-- +goose StatementBegin
-- Motif et échéance obligatoires côté applicatif (vérifiés dans
-- UpdateModeration, pas seulement ici : un CHECK ne peut pas exiger un motif
-- « seulement quand on passe à true » sans bloquer les lignes historiques).
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "shadowbanReason" TEXT,
    ADD COLUMN IF NOT EXISTS "shadowbanUntil" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "shadowbanReviewAt" TIMESTAMP(3);
-- +goose StatementEnd

-- +goose StatementBegin
-- Budget atomique par capacité : (périmètre, action, fenêtre) → consommation.
-- La consommation se fait par UPDATE conditionnel (`consumed + n <= cap`) en
-- une seule requête : deux workers ou deux routes concurrents ne dépassent
-- jamais, même en course. La fenêtre est un instant tronqué (jour, heure)
-- choisi par l'appelant, jamais une durée glissante approximative.
CREATE TABLE IF NOT EXISTS "CapabilityBudget" (
    "id"        TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId"   TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "window"    TIMESTAMP(3) NOT NULL,
    "cap"       INTEGER NOT NULL,
    "consumed"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CapabilityBudget_cap_check" CHECK ("cap" > 0),
    CONSTRAINT "CapabilityBudget_consumed_check" CHECK ("consumed" >= 0)
);

-- Un seul compteur par (périmètre, action, fenêtre) : pas de doubles budgets
-- concurrents qui contourneraient le premier.
CREATE UNIQUE INDEX IF NOT EXISTS "CapabilityBudget_unique_key"
    ON "CapabilityBudget"("scopeType", "scopeId", "action", "window");
CREATE INDEX IF NOT EXISTS "CapabilityBudget_expiry_idx"
    ON "CapabilityBudget"("window");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "CapabilityBudget";
ALTER TABLE "User"
    DROP COLUMN IF EXISTS "shadowbanReviewAt",
    DROP COLUMN IF EXISTS "shadowbanUntil",
    DROP COLUMN IF EXISTS "shadowbanReason";
-- +goose StatementEnd
