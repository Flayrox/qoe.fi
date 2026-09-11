-- =====================================================================
-- ⚖️ Legal : documents juridiques versionnés, éditables depuis la console
-- superadmin, servis publiquement sur tenants + consentement tracké.
-- =====================================================================
-- Modèle :
--   legal_document          → l'entité éditoriale (slug stable, audience,
--                             texte à accepter ou non, ordre d'affichage)
--   legal_document_version  → le contenu versionné par locale. Une seule
--                             version PUBLISHED par (document, locale) ;
--                             les anciennes restent archivées (preuve).
--   legal_acceptance        → la preuve de consentement (qui, quelle version
--                             exacte, quand, depuis quelle IP/UA).
-- Aucune suppression physique du contenu publié : on archive.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "legal_document" (
    "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "slug"                TEXT NOT NULL,
    "category"            TEXT NOT NULL DEFAULT 'general',
    "audience"            TEXT NOT NULL DEFAULT 'all',
    "requires_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "is_active"           BOOLEAN NOT NULL DEFAULT true,
    "sort_order"          INTEGER NOT NULL DEFAULT 100,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_document_slug_key" UNIQUE ("slug"),
    CONSTRAINT "legal_document_audience_check" CHECK ("audience" IN ('all', 'creators', 'media', 'developers', 'subscribers')),
    CONSTRAINT "legal_document_category_check" CHECK ("category" IN ('legal', 'privacy', 'commerce', 'creator', 'security', 'general'))
);

CREATE INDEX IF NOT EXISTS "legal_document_active_order_idx" ON "legal_document" ("is_active", "sort_order");

CREATE TABLE IF NOT EXISTS "legal_document_version" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id"  TEXT NOT NULL,
    "locale"       TEXT NOT NULL DEFAULT 'fr',
    "version"      TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "summary"      TEXT NOT NULL DEFAULT '',
    "body"         TEXT NOT NULL DEFAULT '',
    "status"       TEXT NOT NULL DEFAULT 'DRAFT',
    "changelog"    TEXT,
    "effective_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "archived_at"  TIMESTAMP(3),
    "created_by"   UUID,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_document_version_key" UNIQUE ("document_id", "locale", "version"),
    CONSTRAINT "legal_document_version_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT "legal_document_version_document_fkey" FOREIGN KEY ("document_id")
        REFERENCES "legal_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Une seule version publiée par (document, locale) : garanti par la base,
-- pas seulement par le service.
CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_version_one_published_idx"
    ON "legal_document_version" ("document_id", "locale")
    WHERE "status" = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "legal_document_version_document_idx"
    ON "legal_document_version" ("document_id", "locale", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "legal_acceptance" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"     UUID NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id"  TEXT NOT NULL,
    "version"     TEXT NOT NULL,
    "locale"      TEXT NOT NULL DEFAULT 'fr',
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip"          TEXT,
    "user_agent"  TEXT,
    "source"      TEXT NOT NULL DEFAULT 'web',
    "method"      TEXT NOT NULL DEFAULT 'checkbox',

    CONSTRAINT "legal_acceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_acceptance_unique" UNIQUE ("user_id", "version_id"),
    CONSTRAINT "legal_acceptance_document_fkey" FOREIGN KEY ("document_id")
        REFERENCES "legal_document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "legal_acceptance_version_fkey" FOREIGN KEY ("version_id")
        REFERENCES "legal_document_version" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "legal_acceptance_user_idx" ON "legal_acceptance" ("user_id", "accepted_at" DESC);
CREATE INDEX IF NOT EXISTS "legal_acceptance_document_idx" ON "legal_acceptance" ("document_id", "accepted_at" DESC);

-- +goose Down

DROP TABLE IF EXISTS "legal_acceptance";
DROP TABLE IF EXISTS "legal_document_version";
DROP TABLE IF EXISTS "legal_document";
