// =====================================================================
// 💳 Stripe Client — Singleton partagé
// =====================================================================

import Stripe from "stripe";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

/**
 * 💳 Client Stripe (server-side uniquement).
 *
 * ⚠️ NE JAMAIS importer depuis le client : exposerait ta clé secrète.
 */
export const stripe =
  globalForStripe.stripe ??
  new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2024-12-18.acacia",
    typescript: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForStripe.stripe = stripe;
}
