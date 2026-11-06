-- =====================================================================
-- 00069_feature_catalog_interest.sql — Catalogue opérationnel & promesse
-- =====================================================================
-- `FeatureSignal` mesure l'intérêt (vue / clic) mais est purgée après
-- 180 jours : elle ne peut pas porter une promesse « prévenez-moi au
-- lancement ». Cette migration sépare les deux :
--
--   • "Feature"         : l'état opérationnel d'une fonctionnalité (statut,
--                         flag, CTA, page de destination). Les textes restent
--                         dans packages/ui/src/ui/feature-catalog.ts.
--   • "FeatureInterest" : le consentement explicite, durable, daté et
--                         versionné. C'est cette table que les campagnes
--                         `feature.launch` ciblent.
--
-- La migration backfill les signaux `notify` existants : personne ne perd la
-- promesse déjà enregistrée. Les clés inconnues sont créées en pause, sans
-- notification, pour ne jamais envoyer à une audience dont on ignore l'état.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "Feature" (
    "key"            TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'coming-soon',
    "notifyEnabled"  BOOLEAN NOT NULL DEFAULT false,
    "flagKey"        TEXT,
    "href"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "Feature_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "Feature_status_check" CHECK ("status" IN (
        'in-development', 'coming-soon', 'paused', 'beta', 'live', 'retired'
    ))
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "FeatureInterest" (
    "id"              TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
    "featureKey"      TEXT NOT NULL REFERENCES "Feature"("key") ON DELETE CASCADE,
    "userId"          UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "publicationId"   TEXT,
    "source"          TEXT NOT NULL DEFAULT 'studio',
    "status"          TEXT NOT NULL DEFAULT 'active',
    "consentVersion"  TEXT NOT NULL DEFAULT 'v1',
    "consentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt"  TIMESTAMP(3),
    "lastNotifiedAt"  TIMESTAMP(3),
    "lastCampaignId"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureInterest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeatureInterest_status_check" CHECK ("status" IN ('active', 'unsubscribed')),
    CONSTRAINT "FeatureInterest_source_check" CHECK ("source" IN ('studio', 'site')),
    CONSTRAINT "FeatureInterest_consent_version_check" CHECK (char_length("consentVersion") BETWEEN 1 AND 32),
    CONSTRAINT "FeatureInterest_user_feature_key" UNIQUE ("userId", "featureKey")
);
-- +goose StatementEnd

-- +goose StatementBegin
-- Le backfill doit connaître les clés déjà présentes avant d'insérer les
-- consentements. Les fonctionnalités connues du catalogue sont amorcées avec
-- leur état réel ; les clés historiques inconnues restent en pause.
INSERT INTO "Feature" ("key", "status", "notifyEnabled", "href")
VALUES
    ('custom-domain',      'coming-soon', true,  '/settings/domain'),
    ('article-import',     'paused',      false, '/settings/import'),
    ('email-customization','coming-soon', false, '/settings/emails')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Feature" ("key", "status", "notifyEnabled")
SELECT DISTINCT "featureKey", 'paused', false
FROM "FeatureSignal"
WHERE "kind" = 'notify'
ON CONFLICT ("key") DO NOTHING;
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO "FeatureInterest"
    ("featureKey", "userId", "publicationId", "source", "status", "consentVersion", "consentAt", "createdAt", "updatedAt")
SELECT
    s."featureKey",
    s."userId"::uuid,
    s."publicationId",
    s."source",
    'active',
    'v1',
    MIN(s."createdAt"),
    MIN(s."createdAt"),
    MAX(s."createdAt")
FROM "FeatureSignal" s
WHERE s."kind" = 'notify'
  AND s."userId" IS NOT NULL
  AND s."userId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY s."featureKey", s."userId", s."publicationId", s."source"
ON CONFLICT ("userId", "featureKey") DO NOTHING;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX IF NOT EXISTS "FeatureInterest_feature_status_idx"
    ON "FeatureInterest" ("featureKey", "status");
CREATE INDEX IF NOT EXISTS "FeatureInterest_user_status_idx"
    ON "FeatureInterest" ("userId", "status");
-- +goose StatementEnd

-- +goose StatementBegin
-- Campagnes : un lancement de feature est une campagne staff ordinaire, mais
-- son audience est le consentement durable ci-dessus. `featureKey` rend la
-- cible explicite et vérifiable avant tout envoi.
ALTER TABLE "StaffCampaign" ADD COLUMN IF NOT EXISTS "featureKey" TEXT;
ALTER TABLE "StaffCampaign"
    DROP CONSTRAINT IF EXISTS "StaffCampaign_type_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_scope_publication_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_publication_check";
ALTER TABLE "StaffCampaign"
    ADD CONSTRAINT "StaffCampaign_type_check" CHECK ("type" IN (
        'legal.version_notice', 'staff.direct', 'product.announcement', 'feature.launch'
    )),
    ADD CONSTRAINT "StaffCampaign_audience_check" CHECK ("audienceType" IN (
        'all_active_users', 'publication_subscribers', 'feature_interested'
    )),
    ADD CONSTRAINT "StaffCampaign_scope_publication_check" CHECK (
        ("audienceType" = 'publication_subscribers' AND "audiencePublicationId" IS NOT NULL) OR
        ("audienceType" IN ('all_active_users', 'feature_interested') AND "audiencePublicationId" IS NULL)
    ),
    ADD CONSTRAINT "StaffCampaign_feature_key_check" CHECK (
        ("type" = 'feature.launch' AND "featureKey" IS NOT NULL) OR
        ("type" <> 'feature.launch' AND "featureKey" IS NULL)
    );
ALTER TABLE "StaffCampaign"
    ADD CONSTRAINT "StaffCampaign_feature_fkey"
    FOREIGN KEY ("featureKey") REFERENCES "Feature"("key") ON DELETE RESTRICT;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "StaffCampaignDelivery" ADD COLUMN IF NOT EXISTS "interestId" TEXT;
CREATE INDEX IF NOT EXISTS "StaffCampaignDelivery_campaign_interest_idx"
    ON "StaffCampaignDelivery" ("campaignId", "interestId");
-- +goose StatementEnd

-- +goose StatementBegin
-- Séparation des pouvoirs : un rôle éditorial ne publie pas un texte
-- opposable. Seul `legal` (et superadmin) conserve l'écriture juridique.
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'content' AND "capabilityKey" = 'admin.legal.write';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
INSERT INTO "AdminRoleCapability" ("roleKey", "capabilityKey")
VALUES ('content', 'admin.legal.write')
ON CONFLICT DO NOTHING;
DROP INDEX IF EXISTS "StaffCampaignDelivery_campaign_interest_idx";
ALTER TABLE "StaffCampaignDelivery" DROP COLUMN IF EXISTS "interestId";
ALTER TABLE "StaffCampaign" DROP CONSTRAINT IF EXISTS "StaffCampaign_feature_fkey";
ALTER TABLE "StaffCampaign"
    DROP CONSTRAINT IF EXISTS "StaffCampaign_feature_key_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_scope_publication_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_type_check";
ALTER TABLE "StaffCampaign" DROP COLUMN IF EXISTS "featureKey";
DROP INDEX IF EXISTS "FeatureInterest_user_status_idx";
DROP INDEX IF EXISTS "FeatureInterest_feature_status_idx";
DROP TABLE IF EXISTS "FeatureInterest";
DROP TABLE IF EXISTS "Feature";
-- +goose StatementEnd
