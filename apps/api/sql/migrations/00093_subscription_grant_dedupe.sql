-- =====================================================================
-- 🎟️ Migration 00093 : un abonnement Stripe = un octroi
-- =====================================================================
-- `checkout.session.completed` et `customer.subscription.updated` sont
-- rejoués par Stripe (et par asynq) : sans contrainte, chaque rejeu pouvait
-- empiler un grant Plus. Le code utilise désormais la note
-- `stripe:<subscriptionId>` comme clé (Ensure pour le premier paiement,
-- Extend pour les renouvellements) ; cet index rend l'unicité vraie même
-- sous concurrence.
--
-- Portée volontairement limitée aux octrois Stripe : les octrois manuels
-- (staff, presse…) gardent leur historique multiple.
-- =====================================================================

-- +goose NO TRANSACTION
-- +goose Up
SET lock_timeout = '3s';

-- CONCURRENTLY : la table des octrois est lue à chaque contrôle de droit
-- (HasEntitlement / HasPlus), un index bloquant figerait ces lectures.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "SubscriptionGrant_stripe_subscription_key"
    ON "SubscriptionGrant" ("subjectType", "subjectId", "plan", "note")
    WHERE "grantedBy" = 'stripe';

-- +goose Down
SET lock_timeout = '3s';

DROP INDEX CONCURRENTLY IF EXISTS "SubscriptionGrant_stripe_subscription_key";
