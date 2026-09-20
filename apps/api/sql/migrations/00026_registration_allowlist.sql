-- +goose Up
-- Allowlist d'inscription : quand ALLOW_NEW_REGISTRATIONS=false (accès privé),
-- seuls les emails présents ici (et non encore utilisés) peuvent créer un
-- compte via POST /v1/me/sync. Géré depuis la console admin (toggle +
-- ajout/suppression d'emails). Les emails sont stockés normalisés
-- (minuscules, sans espaces).
CREATE TABLE IF NOT EXISTS "RegistrationAllowlist" (
    "email" TEXT NOT NULL,
    "note" TEXT,
    "invitedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationAllowlist_pkey" PRIMARY KEY ("email")
);

CREATE INDEX IF NOT EXISTS "RegistrationAllowlist_usedAt_idx" ON "RegistrationAllowlist"("usedAt");

-- +goose Down
DROP TABLE IF EXISTS "RegistrationAllowlist" CASCADE;
