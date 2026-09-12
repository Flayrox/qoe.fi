-- =====================================================================
-- ✅ Newsletter — double opt-in (confirmation email des inscriptions)
-- =====================================================================
-- La boucle de croissance (SubscribeForm → POST /v1/home/subscribe) annonce
-- « Vérifiez votre boîte mail pour confirmer votre abonnement » mais aucun
-- email n'était envoyé : chaque adresse passait directement en ACTIVE +
-- receiveArticles=true. Trois conséquences : consentement non démontrable
-- (RGPD/CNIL — inscription d'un tiers possible, spam vers des emails dont on
-- ne détient pas le consentement), bounces de typos qui brûlent le domaine
-- d'envoi, et abonnés « fantômes » dans les stats.
--
-- Le modèle : l'inscription publique crée un abonné SANS receiveArticles
-- (confirmationToken non nul) et enfile une tâche asynq subscriber.confirm ;
-- le worker envoie l'email de confirmation ; le lien signé (HMAC, miroir de
-- l'unsubscribe RFC 8058) confirme receiveArticles=true et efface le token.
-- Les créateurs (studio/API) et Stripe (paiement) confirment d'office :
-- aucune friction là où il y a déjà une relation authentifiée.
--
-- Backfill : tout abonné existant est considéré confirmé (il était actif
-- avant cette migration ; on ne purge personne).

-- +goose Up
ALTER TABLE "Subscriber"
    ADD COLUMN "confirmedAt" TIMESTAMP(3),
    ADD COLUMN "confirmationToken" TEXT;

UPDATE "Subscriber" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL;

CREATE INDEX "Subscriber_confirmation_token_idx" ON "Subscriber"("confirmationToken")
    WHERE "confirmationToken" IS NOT NULL;
