-- =====================================================================
-- 🚩 Feature Flags : table de configuration dynamique sans redéploiement
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "feature_flags" (
    "key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "target_roles" TEXT[] NOT NULL DEFAULT '{all}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- Seed initial des 6 flags existants
INSERT INTO "feature_flags" ("key", "is_enabled", "description", "target_roles")
VALUES
    ('feed-recommendations', true, 'Recommandations dynamiques dans le flux principal', '{all}'),
    ('web-newsletter-banner', false, 'Bandeau newsletter sur le site public', '{all}'),
    ('dashboard-ai-title-suggestions', false, 'Suggestions de titres par IA dans l''éditeur', '{admin}'),
    ('landing-pricing-section', false, 'Nouvelle section pricing sur la landing', '{all}'),
    ('admin-audit-log', false, 'Journal d''audit détaillé des actions admin', '{admin}'),
    ('workers-newsletter-dispatch', true, 'Coupe-feu d''envoi automatique des newsletters', '{all}')
ON CONFLICT ("key") DO NOTHING;

-- +goose Down

DROP TABLE IF EXISTS "feature_flags";
