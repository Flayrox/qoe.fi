// =====================================================================
// 💳 Stripe Webhooks — Handlers
// =====================================================================
// 📖 Centralise le traitement des webhooks Stripe pour qu'ils soient
//    accessibles depuis apps/api (et plus tard depuis apps/console).
// =====================================================================

import type Stripe from "stripe";
import { stripe } from "./client";

/**
 * 🪝 Vérifie la signature d'un webhook Stripe.
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string
): Promise<Stripe.Event> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * 🪝 Handlers par type d'événement Stripe.
 */
export const WEBHOOK_HANDLERS: Record<string, (event: Stripe.Event) => Promise<void>> = {
  // Paiement d'abonnement réussi
  "invoice.payment_succeeded": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.log("✅ Paiement réussi :", invoice.id);
    // TODO : marquer le subscriber comme actif, créditer le créateur
  },

  // Paiement échoué
  "invoice.payment_failed": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn("⚠️ Paiement échoué :", invoice.id);
    // TODO : notifier le user, suspendre l'abonnement
  },

  // Abonnement annulé
  "customer.subscription.deleted": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    console.log("🚫 Abonnement annulé :", subscription.id);
    // TODO : désactiver le subscriber
  },

  // Compte Connect créé
  "account.updated": async (event) => {
    const account = event.data.object as Stripe.Account;
    console.log("👤 Compte Stripe mis à jour :", account.id);
    // TODO : mettre à jour stripeEnabled du user
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
