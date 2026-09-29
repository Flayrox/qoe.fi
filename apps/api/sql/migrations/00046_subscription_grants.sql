-- =====================================================================
-- 💎 Abonnements manuels : octroi staff SANS Stripe (intérim)
-- =====================================================================
-- Avant Stripe, le staff attribue les paliers à la main : Pro offert à un
-- média (sans qu'il soit « abonné »), Plus offert à un lecteur, accès
-- programmé (début futur), fin datée. Règles :
--
--   - Source UNIQUE des droits : HasEntitlement(subject, plan, now) —
--     octroi effectif ssi startsAt <= now < endsAt (endsAt NULL = sans fin).
--     Fini la colonne Publication.emailPro (SUPPRIMÉE ici — dev only,
--     pré-lancement, zéro donnée à migrer) : plus de double source.
--   - Pas de suppression : révoquer = endsAt = now (l'historique reste —
--     qui a donné quoi, quand, pourquoi). Rouvrir = nouvel octroi.
--   - Pas d'expiration automatique à purger : l'échéance est une condition
--     de lecture (plus de sweep, plus de double écriture — leçon des
--     shadowbans : l'état dérivé bat l'état dupliqué).
--   - Stripe, plus tard : webhook → MÊMES fonctions (octroi plan payé,
--     endsAt = fin de période ; impayé → révocation). Le front et les
--     gardes ne changeront pas — seule la source des octrois s'ajoute.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "SubscriptionGrant" (
    "id"          TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId"   TEXT NOT NULL,
    "plan"        TEXT NOT NULL,
    "startsAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt"      TIMESTAMP(3),
    "grantedBy"   TEXT NOT NULL,
    "note"        TEXT NOT NULL DEFAULT '',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionGrant_subject_check" CHECK ("subjectType" IN ('user', 'publication')),
    CONSTRAINT "SubscriptionGrant_plan_check" CHECK ("plan" IN ('pro', 'plus')),
    CONSTRAINT "SubscriptionGrant_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

-- Effectivité : sujet + plan + fenêtre (l'index sert la lecture
-- HasEntitlement comme l'historique par sujet).
CREATE INDEX IF NOT EXISTS "SubscriptionGrant_effective_idx"
    ON "SubscriptionGrant"("subjectType", "subjectId", "plan", "startsAt", "endsAt");
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "Publication"
    DROP COLUMN IF EXISTS "emailPro";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "Publication"
    ADD COLUMN IF NOT EXISTS "emailPro" BOOLEAN NOT NULL DEFAULT false;
DROP TABLE IF EXISTS "SubscriptionGrant";
-- +goose StatementEnd
