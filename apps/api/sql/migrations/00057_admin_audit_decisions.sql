-- =====================================================================
-- 🧾 Console admin : audit lisible et journal des décisions (plan, Phase 4)
-- =====================================================================
-- Deux manques, une même question : « qui a fait quoi, qui a été refusé, et
-- pourquoi ? »
--
--   1. "AdminAuditLog" (00015) enregistrait l'acteur, l'action, la cible et un
--      métadonnées JSONB. Il ne portait ni la CAPACITÉ exercée, ni le motif, ni
--      le diff avant/après : relire une attribution de rôle demandait de
--      décoder du JSON au jugé.
--   2. Les décisions du garde (internal/adminauthz) n'existaient que dans les
--      logs : impossible de lister, avant d'armer `authz-enforce`, les personnes
--      et automatisations qui seraient bloquées. En mode OBSERVATION, un refus
--      doit laisser une trace interrogeable — c'est tout l'intérêt du mode.
--
-- La table de décisions est volontairement séparée du journal d'audit : elle a
-- un volume très supérieur (une ligne par passage dans le garde), une rétention
-- courte et un usage statistique, là où l'audit est un registre d'actes.
-- =====================================================================

-- +goose Up

-- ── 1. Enrichissement du journal d'audit ────────────────────────────────────
-- Colonnes nullables : les lignes existantes restent valides, et une action qui
-- ne déclare pas sa capacité ne prétend pas en avoir une.
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "capability" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "proofLevel" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "requestId"  TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "ip"         TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "reason"     TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "before"     JSONB;
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "after"      JSONB;

CREATE INDEX IF NOT EXISTS "AdminAuditLog_capability_idx" ON "AdminAuditLog" ("capability");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetId_idx"   ON "AdminAuditLog" ("targetId");

-- ── 2. Journal des décisions d'autorisation ─────────────────────────────────
-- Une ligne par passage dans le garde : capacité exigée, issue (accordée /
-- refusée / refus seulement observé), mode en vigueur, route visée. `allowed`
-- dit la décision THÉORIQUE (la capacité était-elle détenue ?), `mode` dit si
-- elle a été APPLIQUÉE — c'est la distinction qui rend l'observation lisible.
CREATE TABLE IF NOT EXISTS "AdminAuthzDecision" (
    "id"         TEXT NOT NULL,
    -- Identité visée (NULL si aucune session : refus d'authentification).
    "userId"     UUID,
    "capability" TEXT NOT NULL,
    "allowed"    BOOLEAN NOT NULL,
    -- Code de refus (internal/authz) : deny_missing_capability, deny_weak_auth…
    "code"       TEXT NOT NULL DEFAULT '',
    -- Mode effectif : 'observe' | 'enforce'.
    "mode"       TEXT NOT NULL DEFAULT 'observe',
    -- Niveau de preuve exigé (N0–N3) quand la route en exige un (Phase 3).
    "proofLevel" TEXT,
    "method"     TEXT NOT NULL DEFAULT '',
    "path"       TEXT NOT NULL DEFAULT '',
    "ip"         TEXT,
    "requestId"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuthzDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuthzDecision_createdAt_idx"  ON "AdminAuthzDecision" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuthzDecision_capability_idx" ON "AdminAuthzDecision" ("capability", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuthzDecision_denied_idx"     ON "AdminAuthzDecision" ("allowed", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuthzDecision_userId_idx"     ON "AdminAuthzDecision" ("userId");

-- +goose Down

DROP TABLE IF EXISTS "AdminAuthzDecision";

DROP INDEX IF EXISTS "AdminAuditLog_targetId_idx";
DROP INDEX IF EXISTS "AdminAuditLog_capability_idx";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "after";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "before";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "reason";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "requestId";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "proofLevel";
ALTER TABLE "AdminAuditLog" DROP COLUMN IF EXISTS "capability";
