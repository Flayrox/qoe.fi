-- =====================================================================
-- 📣 Legal — avis de nouvelle version + journal serveur du consentement traceurs
-- =====================================================================
-- Deux manques comblés ici :
--
-- 1. legal_notice / legal_notice_delivery
--    Quand une version d'un document « à accepter » est publiée, les personnes
--    qui avaient accepté la version précédente doivent être prévenues (art. 12
--    RGPD : information effective). On persiste l'avis puis une livraison email
--    par destinataire, drainée par un worker. Un email n'est jamais envoyé deux
--    fois (UNIQUE sur notice_id + user_id) et la preuve de l'envoi reste en base.
--
-- 2. cookie_consent_record
--    Journal append-only des choix de traceurs, y compris pour un visiteur
--    anonyme (pas de compte requis). C'est la preuve côté plateforme : quel
--    choix, quelle version de politique, quand, depuis quelle IP/UA. On
--    n'écrase jamais une ligne : un changement de choix ajoute une ligne, ce
--    qui rend l'historique auditable.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "legal_notice" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id" TEXT NOT NULL,
    "version_id"  TEXT NOT NULL,
    "locale"      TEXT NOT NULL DEFAULT 'fr',
    "version"     TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "changelog"   TEXT,
    "portal_path" TEXT NOT NULL DEFAULT '/legal',
    "created_by"  UUID,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_notice_pkey" PRIMARY KEY ("id"),
    -- Un avis par version : republier la même version ne crée pas de doublon.
    CONSTRAINT "legal_notice_version_key" UNIQUE ("version_id"),
    CONSTRAINT "legal_notice_document_fkey" FOREIGN KEY ("document_id")
        REFERENCES "legal_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "legal_notice_version_fkey" FOREIGN KEY ("version_id")
        REFERENCES "legal_document_version" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "legal_notice_created_idx" ON "legal_notice" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "legal_notice_delivery" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "notice_id"    TEXT NOT NULL,
    "user_id"      UUID NOT NULL,
    "email"        TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "provider"     TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at"      TIMESTAMP(3),
    "last_error"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_notice_delivery_pkey" PRIMARY KEY ("id"),
    -- Un destinataire = un email par avis, quel que soit le nombre de reprises.
    CONSTRAINT "legal_notice_delivery_unique" UNIQUE ("notice_id", "user_id"),
    CONSTRAINT "legal_notice_delivery_status_check" CHECK ("status" IN ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
    CONSTRAINT "legal_notice_delivery_notice_fkey" FOREIGN KEY ("notice_id")
        REFERENCES "legal_notice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "legal_notice_delivery_queue_idx"
    ON "legal_notice_delivery" ("status", "available_at");

CREATE TABLE IF NOT EXISTS "cookie_consent_record" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    -- Journal append-only : un compteur monotone donne un ordre d'écriture
    -- stable (deux choix peuvent tomber dans la même milliseconde).
    "seq"            BIGSERIAL NOT NULL,
    "consent_id"     TEXT,
    "user_id"        UUID,
    "session_id"     TEXT,
    "locale"         TEXT NOT NULL DEFAULT 'fr',
    "policy_version" TEXT NOT NULL,
    "categories"     JSONB NOT NULL DEFAULT '{}'::jsonb,
    "source"         TEXT NOT NULL DEFAULT 'banner',
    "country"        TEXT,
    "ip"             TEXT,
    "user_agent"     TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookie_consent_record_pkey" PRIMARY KEY ("id")
);

-- Série de choix d'un même navigateur (le client conserve `consent_id`).
CREATE INDEX IF NOT EXISTS "cookie_consent_record_consent_idx"
    ON "cookie_consent_record" ("consent_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "cookie_consent_record_created_idx"
    ON "cookie_consent_record" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "cookie_consent_record_user_idx"
    ON "cookie_consent_record" ("user_id", "created_at" DESC);

-- +goose Down

DROP TABLE IF EXISTS "cookie_consent_record";
DROP TABLE IF EXISTS "legal_notice_delivery";
DROP TABLE IF EXISTS "legal_notice";
