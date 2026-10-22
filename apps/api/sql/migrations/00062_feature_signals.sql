-- =====================================================================
-- 00062_feature_signals.sql — Mesure d'intérêt des fonctionnalités à venir
-- =====================================================================
-- Une ligne = un signal émis depuis l'interstitiel d'annonce d'une
-- fonctionnalité indisponible (catalogue @qoe/ui, clé stable).
--
-- Attribution : "userId" (le créateur qui consulte) et "publicationId"
-- (sa publication personnelle ou le média actif). Les statistiques se
-- lisent donc par publication, ce qui couvre les deux cas —
-- « pour le créateur » et « pour le média si c'est un média ».
--
-- Deux natures :
--   • view   — l'annonce a été ouverte (au plus une par utilisateur,
--              fonctionnalité et 24 h : anti-inflation, cf. service Go) ;
--   • notify — « me prévenir » : unique par utilisateur et fonctionnalité
--              (index partiel) pour qu'un double clic ne compte pas deux fois.
-- =====================================================================

-- +goose Up
CREATE TABLE IF NOT EXISTS "FeatureSignal" (
    "id"            TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
    "featureKey"    TEXT NOT NULL,
    "kind"          TEXT NOT NULL,
    "source"        TEXT NOT NULL DEFAULT 'studio',
    "userId"        TEXT,
    "publicationId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureSignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeatureSignal_kind_check" CHECK ("kind" IN ('view', 'notify')),
    CONSTRAINT "FeatureSignal_source_check" CHECK ("source" IN ('studio', 'site')),
    CONSTRAINT "FeatureSignal_feature_key_check" CHECK ("featureKey" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Lecture des agrégats par publication (bloc analytics du studio).
CREATE INDEX IF NOT EXISTS "FeatureSignal_publication_kind_idx"
    ON "FeatureSignal" ("publicationId", "kind", "featureKey");

-- Fenêtre glissante de déduplication des vues + purge éventuelle.
CREATE INDEX IF NOT EXISTS "FeatureSignal_user_feature_created_idx"
    ON "FeatureSignal" ("userId", "featureKey", "createdAt" DESC);

-- Un seul « me prévenir » par personne et par fonctionnalité.
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureSignal_notify_unique_idx"
    ON "FeatureSignal" ("userId", "featureKey")
    WHERE "kind" = 'notify' AND "userId" IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS "FeatureSignal";
