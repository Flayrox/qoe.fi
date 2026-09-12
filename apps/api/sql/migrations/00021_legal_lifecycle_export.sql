-- =====================================================================
-- ⚖️ Legal — cycle de vie piloté + registre d'exports signés
-- =====================================================================
-- Trois manques comblés ici :
--
-- 1. legal_document_version.scheduled_at
--    Une version peut être préparée puis publiée dans une fenêtre planifiée.
--    Un worker publie à l'échéance, en empruntant EXACTEMENT le même chemin
--    que la publication manuelle (archivage de l'ancienne version, avis aux
--    personnes concernées). Rien ne distingue, in fine, une publication
--    automatique d'une publication humaine : c'est voulu.
--
-- 2. legal_review / legal_review_reminder
--    Un texte ne « périme » pas tout seul : il faut le relire. Chaque
--    échéance réglementaire ouvre une revue (une ligne par document et par
--    échéance), un brouillon est proposé automatiquement, et des rappels
--    email partent vers les superadmins tant que la revue reste ouverte.
--    UNIQUE (document_id, rule_key, due_at) garantit qu'une même échéance
--    n'ouvre jamais deux revues, même si le worker redémarre en boucle.
--
-- 3. legal_consent_export
--    Registre des exports du consentement. Chaque export est signé (HMAC)
--    et chaîné au précédent : un export ne peut pas être produit puis
--    remplacé en silence, et une demande de contrôle ou une réquisition
--    trouve une pièce intègre, horodatée et vérifiable.
-- =====================================================================

-- +goose Up

ALTER TABLE "legal_document_version"
    ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "legal_document_version_schedule_idx"
    ON "legal_document_version" ("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "legal_review" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id"      TEXT NOT NULL,
    "rule_key"         TEXT NOT NULL,
    "due_at"           TIMESTAMP(3) NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'OPEN',
    "draft_version_id" TEXT,
    "notes"            TEXT,
    "opened_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"     TIMESTAMP(3),
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_review_pkey" PRIMARY KEY ("id"),
    -- Une échéance = une revue. Rejouer le worker ne duplique rien.
    CONSTRAINT "legal_review_obligation_key" UNIQUE ("document_id", "rule_key", "due_at"),
    CONSTRAINT "legal_review_status_check" CHECK ("status" IN ('OPEN', 'DRAFTED', 'PUBLISHED', 'DISMISSED')),
    CONSTRAINT "legal_review_document_fkey" FOREIGN KEY ("document_id")
        REFERENCES "legal_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "legal_review_draft_fkey" FOREIGN KEY ("draft_version_id")
        REFERENCES "legal_document_version" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "legal_review_status_due_idx"
    ON "legal_review" ("status", "due_at");

CREATE TABLE IF NOT EXISTS "legal_review_reminder" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "review_id"    TEXT NOT NULL,
    "user_id"      UUID NOT NULL,
    "email"        TEXT NOT NULL,
    "stage"        TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "provider"     TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at"      TIMESTAMP(3),
    "last_error"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_review_reminder_pkey" PRIMARY KEY ("id"),
    -- Une revue, un palier, un destinataire : jamais deux fois le même rappel.
    CONSTRAINT "legal_review_reminder_unique" UNIQUE ("review_id", "user_id", "stage"),
    CONSTRAINT "legal_review_reminder_status_check" CHECK ("status" IN ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
    CONSTRAINT "legal_review_reminder_stage_check" CHECK ("stage" IN ('SOON', 'OVERDUE', 'DRAFTED')),
    CONSTRAINT "legal_review_reminder_review_fkey" FOREIGN KEY ("review_id")
        REFERENCES "legal_review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "legal_review_reminder_queue_idx"
    ON "legal_review_reminder" ("status", "available_at");

CREATE TABLE IF NOT EXISTS "legal_consent_export" (
    "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    -- Ordre d'écriture monotone : c'est lui qui chaîne les exports entre eux.
    "seq"                  BIGSERIAL NOT NULL,
    "scope"                TEXT NOT NULL DEFAULT 'full',
    "subject"              TEXT,
    "reason"               TEXT,
    "filters"              JSONB NOT NULL DEFAULT '{}'::jsonb,
    "requested_by"         UUID,
    "requested_by_email"   TEXT,
    "documents_count"      INTEGER NOT NULL DEFAULT 0,
    "acceptances_count"    INTEGER NOT NULL DEFAULT 0,
    "cookie_records_count" INTEGER NOT NULL DEFAULT 0,
    "content_sha256"       TEXT NOT NULL,
    "previous_chain"       TEXT,
    "chain_sha256"         TEXT NOT NULL,
    "signature"            TEXT NOT NULL,
    "key_id"               TEXT NOT NULL,
    "algorithm"            TEXT NOT NULL DEFAULT 'HMAC-SHA256',
    "generated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_consent_export_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_consent_export_scope_check" CHECK ("scope" IN ('full', 'document', 'user', 'window'))
);

CREATE INDEX IF NOT EXISTS "legal_consent_export_created_idx"
    ON "legal_consent_export" ("generated_at" DESC);

-- +goose Down

DROP TABLE IF EXISTS "legal_consent_export";
DROP TABLE IF EXISTS "legal_review_reminder";
DROP TABLE IF EXISTS "legal_review";
DROP INDEX IF EXISTS "legal_document_version_schedule_idx";
ALTER TABLE "legal_document_version" DROP COLUMN IF EXISTS "scheduled_at";
