-- =====================================================================
-- Site Studio : brouillon, publication et versions des mises en page
-- =====================================================================
-- Le Studio édite un BROUILLON (SiteLayout.draft) sans toucher au site
-- public ; Publier copie le brouillon vers Publication.layoutStyle et
-- archive l'ancienne version publiée dans SiteVersion (restauration).
-- Sans brouillon, le site public (layoutStyle) reste la source de vérité.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "SiteLayout" (
    "publicationId" TEXT NOT NULL,
    "draft"         TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteLayout_pkey" PRIMARY KEY ("publicationId"),
    CONSTRAINT "SiteLayout_publicationId_fkey"
        FOREIGN KEY ("publicationId") REFERENCES "Publication"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SiteVersion" (
    "id"            TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "layout"        TEXT NOT NULL,
    "label"         TEXT NOT NULL DEFAULT '',
    "createdBy"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteVersion_publicationId_fkey"
        FOREIGN KEY ("publicationId") REFERENCES "Publication"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SiteVersion_publicationId_createdAt_idx"
    ON "SiteVersion" ("publicationId", "createdAt" DESC);

-- +goose Down

DROP TABLE IF EXISTS "SiteVersion";
DROP TABLE IF EXISTS "SiteLayout";
