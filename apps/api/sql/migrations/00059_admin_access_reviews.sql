-- =====================================================================
-- 🗓️ Console admin : revue périodique des accès (plan, Phase 8)
-- =====================================================================
-- « Qui détient quoi, jusqu'à quand » n'a de valeur que si quelqu'un le
-- relit régulièrement. La console affiche les échéances en direct et gèle un
-- rôle échu à la lecture ; ce qu'il manquait, c'est la TRACE de la revue :
-- un instantané par mois, écrit même quand personne n'ouvre l'écran.
--
-- Une ligne par mois (UNIQUE sur la période) : le travailleur qui la produit
-- tourne chaque jour, mais n'écrit que lorsque le mois tourne — idempotent,
-- un redémarrage ne fabrique pas de doublon.
--
-- Le rapport est stocké tel quel (JSONB) et non reconstruit : un instantané
-- d'octobre doit raconter octobre, pas l'état du monde au moment où on le
-- relit. On ne range pas ça dans AdminAuditLog, dont `actorId` est NOT NULL :
-- personne n'a « fait » cette revue, c'est le calendrier.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "AdminAccessReview" (
    "id"        TEXT NOT NULL,
    -- Période couverte, 'AAAA-MM' : la clé de doublon du travailleur.
    "period"    TEXT NOT NULL,
    -- L'instantané complet : échéances proches, attributions échues, repartage
    -- par rôle, totaux, horodatage de génération.
    "report"    JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccessReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminAccessReview_period_key" UNIQUE ("period"),
    CONSTRAINT "AdminAccessReview_period_check" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- Lecture de l'écran : la revue la plus récente d'abord.
CREATE INDEX IF NOT EXISTS "AdminAccessReview_createdAt_idx"
    ON "AdminAccessReview" ("createdAt" DESC);

-- +goose Down

DROP TABLE IF EXISTS "AdminAccessReview";
