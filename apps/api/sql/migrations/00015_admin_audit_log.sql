-- =====================================================================
-- 🛡️ AdminAuditLog : journal d'audit des actions sensibles superadmin
-- (changements de permissions API, bascules du contrôle d'accès global).
-- Écritures pilotées par le flag `admin-audit-log` (console admin).
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'user',
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorId_idx" ON "AdminAuditLog" ("actorId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog" ("action");

-- +goose Down

DROP TABLE IF EXISTS "AdminAuditLog";