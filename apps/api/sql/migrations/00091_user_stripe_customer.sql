-- =====================================================================
-- 💳 Migration 00091 : lien User → client Stripe
-- =====================================================================
-- Le portail de facturation avait besoin de retrouver le client Stripe d'un
-- lecteur. Jusqu'ici on le déduisait de `Subscriber.stripeCustomerId` via
-- l'email : fragile (abonnement à une autre publication, bundle Plus, email
-- changé). `User.stripeCustomerId` est le lien stable, écrit par le webhook
-- Checkout, lu par POST /v1/billing/portal.
--
-- Rejouable : ADD COLUMN / CREATE INDEX conditionnels. Aucune donnée
-- rétroactive n'est inventée (les anciens comptes restent sur le repli email).
-- =====================================================================

-- +goose Up
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key"
    ON "User"("stripeCustomerId")
    WHERE "stripeCustomerId" IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS "User_stripeCustomerId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeCustomerId";
