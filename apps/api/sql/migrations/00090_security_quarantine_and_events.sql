-- =====================================================================
-- 🛡️ Migration 00090 : Quarantaine API lecture seule + Journal SecurityEvent
-- =====================================================================
-- 1. Ajoute le statut de cycle de vie aux clés API ("ApiKey") :
--    ACTIVE | READ_ONLY | REVOKED, ainsi que suspendedAt / suspendReason.
-- 2. Ajoute apiReadOnlyAt / apiReadOnlyReason sur "Publisher" pour figer
--    l'API créateur d'une publication en mode lecture seule pré-incident.
-- 3. Crée "SecurityEvent" pour tracer les événements de sécurité (nouveau
--    périphérique, changement mot de passe/email, MFA, clés API, quarantaine)
--    et alimenter l'écran Historique de sécurité + détection de nouvelle IP.
-- =====================================================================

-- +goose Up
ALTER TABLE "ApiKey"
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "suspendReason" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_apikey_status'
    ) THEN
        ALTER TABLE "ApiKey"
            ADD CONSTRAINT chk_apikey_status
            CHECK (status IN ('ACTIVE', 'READ_ONLY', 'REVOKED'));
    END IF;
END$$;

ALTER TABLE "Publisher"
    ADD COLUMN IF NOT EXISTS "apiReadOnlyAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "apiReadOnlyReason" TEXT;

CREATE TABLE IF NOT EXISTS "SecurityEvent" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" UUID REFERENCES "User"(id) ON DELETE CASCADE,
    "publisherId" TEXT REFERENCES "Publisher"(id) ON DELETE CASCADE,
    "apiKeyId" TEXT REFERENCES "ApiKey"(id) ON DELETE SET NULL,
    "eventType" TEXT NOT NULL,
    "ipSubnet" TEXT,
    "userAgent" TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_createdAt_idx"
    ON "SecurityEvent" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SecurityEvent_publisherId_createdAt_idx"
    ON "SecurityEvent" ("publisherId", "createdAt" DESC);

-- +goose Down
DROP TABLE IF EXISTS "SecurityEvent";

ALTER TABLE "Publisher"
    DROP COLUMN IF EXISTS "apiReadOnlyReason",
    DROP COLUMN IF EXISTS "apiReadOnlyAt";

ALTER TABLE "ApiKey"
    DROP CONSTRAINT IF EXISTS chk_apikey_status,
    DROP COLUMN IF EXISTS "suspendReason",
    DROP COLUMN IF EXISTS "suspendedAt",
    DROP COLUMN IF EXISTS status;
