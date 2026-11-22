-- =====================================================================
-- ✔️ Consentements par utilisateur, sortis de "SystemConfig"
-- =====================================================================
-- Les choix analytics / personnalisation / marketing étaient stockés dans
-- "SystemConfig" sous la clé « CONSENT_<uuid> ». Deux conséquences fâcheuses :
--   * `GET /v1/admin/system-config` (ListSystemConfigs, non filtré) exposait les
--     consentements de TOUS les comptes à la console admin ;
--   * un `DELETE`/`UpsertSystemConfig` admin sur cette clé pouvait effacer la
--     preuve de consentement d'un utilisateur.
-- Table dédiée, une ligne par compte (mise à jour en place, horodatée).
--
-- Ajoute aussi l'unicité « une seule demande de suppression active par compte » :
-- `CreateDeletionRequest` reposait sur un `NOT EXISTS` sans verrou, deux
-- requêtes concurrentes pouvaient créer deux demandes PENDING.
-- =====================================================================

-- +goose NO TRANSACTION
-- Index sur une table existante ("AccountDeletionRequest") : CONCURRENTLY, donc
-- hors transaction. Chaque étape est idempotente (relançable après échec).

-- +goose Up

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "UserConsentPreference" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "userId"          UUID NOT NULL,
    "analytics"       BOOLEAN NOT NULL DEFAULT false,
    "personalization" BOOLEAN NOT NULL DEFAULT false,
    "marketing"       BOOLEAN NOT NULL DEFAULT false,
    "version"         TEXT NOT NULL DEFAULT '1',
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConsentPreference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserConsentPreference_userId_key" UNIQUE ("userId"),
    CONSTRAINT "UserConsentPreference_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Reprise des lignes existantes. Chaque valeur est parsée isolément : une clé
-- héritée corrompue ne doit pas faire échouer la migration entière.
-- +goose StatementBegin
DO $$
DECLARE
    r   RECORD;
    uid UUID;
    v   JSONB;
BEGIN
    FOR r IN SELECT key, value FROM "SystemConfig" WHERE key LIKE 'CONSENT\_%' LOOP
        BEGIN
            uid := substr(r.key, 8)::uuid;
            v := r.value::jsonb;
        EXCEPTION WHEN others THEN
            CONTINUE;
        END;
        INSERT INTO "UserConsentPreference"
            ("userId", "analytics", "personalization", "marketing", "version", "updatedAt")
        VALUES (
            uid,
            COALESCE((v ->> 'analytics')::boolean, false),
            COALESCE((v ->> 'personalization')::boolean, false),
            COALESCE((v ->> 'marketing')::boolean, false),
            COALESCE(NULLIF(v ->> 'version', ''), '1'),
            now()
        )
        ON CONFLICT ("userId") DO NOTHING;
    	END LOOP;
END $$;
-- +goose StatementEnd

DELETE FROM "SystemConfig" WHERE key LIKE 'CONSENT\_%';

-- Une seule demande de suppression active par compte : on clôt les doublons
-- éventuels (les plus récents restent actifs) avant de poser l'index partiel.
SET lock_timeout = '3s';
UPDATE "AccountDeletionRequest" AS r
SET status = 'CANCELED', "processedAt" = now()
WHERE r.id IN (
    SELECT id FROM (
        SELECT id,
               row_number() OVER (
                   PARTITION BY "userId"
                   ORDER BY "requestedAt" DESC, id DESC
               ) AS rn
        FROM "AccountDeletionRequest"
        WHERE status IN ('PENDING', 'PROCESSING')
    ) AS ranked
    WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "AccountDeletionRequest_one_active_per_user"
    ON "AccountDeletionRequest" ("userId")
    WHERE status IN ('PENDING', 'PROCESSING');

-- +goose Down

DROP INDEX CONCURRENTLY IF EXISTS "AccountDeletionRequest_one_active_per_user";
DROP TABLE IF EXISTS "UserConsentPreference";
