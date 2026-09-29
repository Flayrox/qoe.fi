-- =====================================================================
-- 🛡️ Anti-abus : motif humain des verdicts de revue (fiche 06 §8)
-- =====================================================================
-- La file de revue (GET /v1/admin/abuse/decisions) clôt chaque dossier par
-- un verdict humain tracé. `deciderId` dit QUI a tranché ; il manquait le
-- POURQUOI en clair : `note` le porte, en colonne dédiée — jamais mélangé
-- aux `reasonCodes` stables (codes machine pour le support et les tests,
-- pas des phrases humaines).
--
-- +goose Up
-- +goose StatementBegin
ALTER TABLE "RiskDecision"
    ADD COLUMN IF NOT EXISTS "note" TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "RiskDecision"
    DROP COLUMN IF EXISTS "note";
-- +goose StatementEnd
