// =====================================================================
// 💳 Stripe Webhooks — Handlers
// =====================================================================
// 📖 Centralise le traitement des webhooks Stripe pour qu'ils soient
//    accessibles depuis apps/api (et plus tard depuis apps/console).
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
 * 🪝 Handlers par type d'événement Stripe.
 */
export const WEBHOOK_HANDLERS: Record<string, (event: Stripe.Event) => Promise<void>> = {
  // Paiement d'abonnement réussi
  'invoice.payment_succeeded': async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.log('✅ Paiement réussi :', invoice.id);

    const creatorId = invoice.metadata?.creatorId;
    const email = invoice.customer_email || invoice.metadata?.subscriberEmail;

    if (!creatorId || !email) {
      console.warn(
        '⚠️ Impossible de traiter le paiement : métadonnées manquantes dans la facture Stripe.',
        {
          creatorId,
          email,
        }
      );
      return;
    }

    const amountPaid = invoice.amount_paid;

    // 1. Activer/Mettre à jour l'abonnement dans PostgreSQL
    await prisma.subscriber.upsert({
      where: {
        email_creatorId: { email, creatorId },
      },
      update: {
        isActive: true,
        isPremium: true,
        ltvCents: { increment: amountPaid },
      },
      create: {
        email,
        creatorId,
        isActive: true,
        isPremium: true,
        ltvCents: amountPaid,
      },
    });

    // 2. Calculer les commissions qoe.fi et créditer le créateur
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
    });

    if (creator) {
      const creatorPlan = creator.role === 'creator' ? 'PRO' : 'FREE';
      const feeCents = calculateFee(amountPaid, creatorPlan);
      const creditAmount = amountPaid - feeCents;

      // Créditer le solde du créateur
      await prisma.user.update({
        where: { id: creatorId },
        data: {
          walletBalanceCents: { increment: creditAmount },
        },
      });

      // Enregistrer la transaction pour audit/historique
      await prisma.walletTransaction.create({
        data: {
          userId: creatorId,
          amountCents: creditAmount,
          type: 'DEPOSIT',
        },
      });

      console.log(
        `💰 Créateur ${creatorId} crédité de ${creditAmount / 100}€ (Frais déduits: ${feeCents / 100}€).`
      );
    }
  },

  // Paiement échoué
  'invoice.payment_failed': async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn('⚠️ Paiement échoué :', invoice.id);

    const creatorId = invoice.metadata?.creatorId;
    const email = invoice.customer_email || invoice.metadata?.subscriberEmail;

    if (creatorId && email) {
      // Suspendre l'accès Premium en cas de non-paiement
      await prisma.subscriber.updateMany({
        where: { email, creatorId },
        data: { isPremium: false },
      });
      console.log(
        `🚫 Accès premium révoqué pour ${email} (Abonné au créateur ${creatorId}) suite à un échec de paiement.`
      );
    }
  },

  // Abonnement annulé
  'customer.subscription.deleted': async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    console.log('🚫 Abonnement annulé :', subscription.id);

    const creatorId = subscription.metadata?.creatorId;
    const email = subscription.metadata?.subscriberEmail;

    if (creatorId && email) {
      // Désactiver le subscriber ou lui enlever son statut Premium
      await prisma.subscriber.updateMany({
        where: { email, creatorId },
        data: { isPremium: false, isActive: false },
      });
      console.log(
        `🚫 Abonnement résilié proprement pour ${email} auprès du créateur ${creatorId}.`
      );
    }
  },

  // Compte Connect créé / mis à jour
  'account.updated': async (event) => {
    const account = event.data.object as Stripe.Account;
    console.log('👤 Compte Stripe mis à jour :', account.id);

    const stripeEnabled = account.charges_enabled && account.details_submitted;

    const user = await prisma.user.findFirst({
      where: { stripeAccountId: account.id },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeAccountId: account.id },
      });
      console.log(
        `✅ Statut de paiement Stripe mis à jour pour le créateur ${user.id} (${user.email}) -> Stripe Activé: ${!!stripeEnabled}`
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
