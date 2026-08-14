// =====================================================================
// 💳 Stripe Webhooks — Handlers
// =====================================================================
// 📖 Centralise le traitement des webhooks Stripe pour qu'ils soient
//    accessibles depuis apps/api (et plus tard depuis apps/console).
//    Depuis le polymorphisme Publication, les abonnements (Subscriber)
//    sont clé par publication (personnelle OU média).
// =====================================================================

import type Stripe from 'stripe';
import { stripe } from './client';
import { prisma } from '@qoe/db/client';
import { calculateFee } from './plans';

/**
 * 🪝 Vérifie la signature d'un webhook Stripe.
 */
export async function verifyWebhook(rawBody: string, signature: string): Promise<Stripe.Event> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * 🔗 Résout la publication (personnelle OU média) associée à une entité `creatorId`.
 * Le creatorId peut être : un User.id OU un Publication.id (selon ce que le client envoie).
 */
async function resolvePublicationId(creatorRef: string): Promise<string | null> {
  // Si c'est déjà un Publication.id
  const direct = await prisma.publication.findUnique({
    where: { id: creatorRef },
    select: { id: true },
  });
  if (direct) return direct.id;

  // Sinon c'est un User.id → publication personnelle
  const pub = await prisma.publication.findFirst({
    where: { type: 'PERSONAL', user: { id: creatorRef } },
    select: { id: true },
  });
  return pub?.id ?? null;
}

/**
 * 🪝 Handlers par type d'événement Stripe.
 */
export const WEBHOOK_HANDLERS: Record<string, (event: Stripe.Event) => Promise<void>> = {
  // Paiement d'abonnement réussi
  'invoice.payment_succeeded': async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.log('✅ Paiement réussi :', invoice.id);

    const creatorRef = invoice.metadata?.creatorId;
    const email = invoice.customer_email || invoice.metadata?.subscriberEmail;

    if (!creatorRef || !email) {
      console.warn(
        '⚠️ Impossible de traiter le paiement : métadonnées manquantes dans la facture Stripe.',
        {
          creatorRef,
          email,
        }
      );
      return;
    }

    const publicationId = await resolvePublicationId(creatorRef);
    if (!publicationId) {
      console.warn('⚠️ Publication introuvable pour le paiement Stripe.', { creatorRef });
      return;
    }

    const amountPaid = invoice.amount_paid;

    // 1. Activer/Mettre à jour l'abonnement dans PostgreSQL
    await prisma.subscriber.upsert({
      where: {
        email_publicationId: { email, publicationId },
      },
      update: {
        isActive: true,
        isPremium: true,
        ltvCents: { increment: amountPaid },
      },
      create: {
        email,
        publicationId,
        isActive: true,
        isPremium: true,
        ltvCents: amountPaid,
      },
    });

    // 2. Calculer les commissions qoe.fi et créditer le propriétaire de la publication
    const owner = await prisma.publication.findUnique({
      where: { id: publicationId },
      select: {
        user: { select: { id: true, role: true } },
        media: {
          select: {
            members: {
              where: { role: 'owner', status: 'active' },
              select: { userId: true },
              take: 1,
            },
          },
        },
      },
    });
    const ownerUser = owner?.user ?? owner?.media?.members?.[0];
    if (ownerUser) {
      const ownerId = 'id' in ownerUser ? ownerUser.id : ownerUser.userId;
      const ownerRole = 'role' in ownerUser ? ownerUser.role : 'creator';
      const creatorPlan = ownerRole === 'creator' ? 'PRO' : 'FREE';
      const feeCents = calculateFee(amountPaid, creatorPlan);
      const creditAmount = amountPaid - feeCents;

      // Créditer le solde du propriétaire
      await prisma.user.update({
        where: { id: ownerId },
        data: {
          walletBalanceCents: { increment: creditAmount },
        },
      });

      // Enregistrer la transaction pour audit/historique
      await prisma.walletTransaction.create({
        data: {
          userId: ownerId,
          amountCents: creditAmount,
          type: 'DEPOSIT',
        },
      });

      console.log(
        `💰 Créateur ${ownerId} crédité de ${creditAmount / 100}€ (Frais déduits: ${feeCents / 100}€).`
      );
    }
  },

  // Paiement échoué
  'invoice.payment_failed': async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn('⚠️ Paiement échoué :', invoice.id);

    const creatorRef = invoice.metadata?.creatorId;
    const email = invoice.customer_email || invoice.metadata?.subscriberEmail;

    if (creatorRef && email) {
      const publicationId = await resolvePublicationId(creatorRef);
      if (publicationId) {
        // Suspendre l'accès Premium en cas de non-paiement
        await prisma.subscriber.updateMany({
          where: { email, publicationId },
          data: { isPremium: false },
        });
        console.log(
          `🚫 Accès premium révoqué pour ${email} (Abonné à la publication ${publicationId}) suite à un échec de paiement.`
        );
      }
    }
  },

  // Abonnement annulé
  'customer.subscription.deleted': async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    console.log('🚫 Abonnement annulé :', subscription.id);

    const creatorRef = subscription.metadata?.creatorId;
    const email = subscription.metadata?.subscriberEmail;

    if (creatorRef && email) {
      const publicationId = await resolvePublicationId(creatorRef);
      if (publicationId) {
        // Désactiver le subscriber ou lui enlever son statut Premium
        await prisma.subscriber.updateMany({
          where: { email, publicationId },
          data: { isPremium: false, isActive: false },
        });
        console.log(
          `🚫 Abonnement résilié proprement pour ${email} auprès de la publication ${publicationId}.`
        );
      }
    }
  },

  // Compte Connect créé / mis à jour
  'account.updated': async (event) => {
    const account = event.data.object as Stripe.Account;
    console.log('👤 Compte Stripe mis à jour :', account.id);

    const stripeEnabled = account.charges_enabled && account.details_submitted;

    const publication = await prisma.publication.findFirst({
      where: { stripeAccountId: account.id },
    });

    if (publication) {
      await prisma.publication.update({
        where: { id: publication.id },
        data: { stripeAccountId: account.id },
      });
      console.log(
        `✅ Statut de paiement Stripe mis à jour pour la publication ${publication.id} (${publication.name}) -> Stripe Activé: ${!!stripeEnabled}`
      );
    }
  },
};

/**
 * 🪝 Dispatch un événement Stripe vers le bon handler.
 */
export async function handleWebhookEvent(event: Stripe.Event) {
  const handler = WEBHOOK_HANDLERS[event.type];
  if (!handler) {
    console.log(`ℹ️ Unhandled Stripe event: ${event.type}`);
    return;
  }
  await handler(event);
}
