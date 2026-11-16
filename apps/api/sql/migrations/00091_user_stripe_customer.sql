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

-- +goose NO TRANSACTION
-- +goose Up
SET lock_timeout = '3s';

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

-- CONCURRENTLY : "User" existe déjà en production, un index bloquant
-- prendrait un verrou en écriture sur la table des comptes.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "User_stripeCustomerId_key"
    ON "User"("stripeCustomerId")
    WHERE "stripeCustomerId" IS NOT NULL;

-- +goose Down
SET lock_timeout = '3s';

DROP INDEX CONCURRENTLY IF EXISTS "User_stripeCustomerId_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeCustomerId";
