-- =====================================================================
-- 🎯 In-App Placements & Messaging Souverain (Licorne 2027)
-- =====================================================================
-- Moteur de placements in-app contextuel, réactif et multi-surfaces :
-- Bannières haut d'écran (notch_banner à courbure inversée C1),
-- Cartes in-page (card), encarts (callout) et fenêtres contextuelles (modal).
-- Remplacement souverain de LaunchDarkly / Appcues sans dépendance SaaS.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "in_app_placements" (
    "id" TEXT NOT NULL,
    "slot" TEXT NOT NULL, -- e.g. 'global.notch', 'reader.billing.hero', 'reader.library.top', 'reader.feed.interstitial'
    "format" TEXT NOT NULL DEFAULT 'notch_banner', -- 'notch_banner', 'card', 'callout', 'modal'
    "type" TEXT NOT NULL DEFAULT 'promo', -- 'promo', 'info', 'warning', 'critical'
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta_label" TEXT,
    "cta_url" TEXT,
    "target_audience" TEXT NOT NULL DEFAULT 'all', -- 'all', 'free_only', 'plus_only', 'pro_only'
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) WITH TIME ZONE,
    "ends_at" TIMESTAMP(3) WITH TIME ZONE,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_placements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_in_app_placements_slot_active" 
ON "in_app_placements" ("slot", "is_active", "priority" DESC);

CREATE TABLE IF NOT EXISTS "user_placement_dismissals" (
    "user_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL REFERENCES "in_app_placements"("id") ON DELETE CASCADE,
    "dismissed_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_placement_dismissals_pkey" PRIMARY KEY ("user_id", "placement_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_placement_dismissals_user" 
ON "user_placement_dismissals" ("user_id");

-- Seed initial : slots par défaut
INSERT INTO "in_app_placements" (
    "id", "slot", "format", "type", "title", "body", "cta_label", "cta_url", "target_audience", "priority", "is_active", "dismissible"
) VALUES (
    'plc_welcome_plus_billing',
    'reader.billing.hero',
    'card',
    'promo',
    'Passez à Qoefi Plus',
    'Accédez à la lecture audio illimitée, la synthèse IA de pointe et vos livres hors-ligne.',
    'Découvrir l''offre Plus',
    '/pricing',
    'free_only',
    10,
    true,
    true
), (
    'plc_global_notch_welcome',
    'global.notch',
    'notch_banner',
    'promo',
    'Nouveau',
    'Bienvenue sur Qoefi — La plateforme indépendante pour créateurs et lecteurs.',
    'Découvrir',
    '/pricing',
    'all',
    5,
    true,
    true
) ON CONFLICT ("id") DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS "user_placement_dismissals";
DROP TABLE IF EXISTS "in_app_placements";
