// =====================================================================
// 💳 Stripe Checkout & Portal Sessions
// =====================================================================

import { stripe } from "./client";

export interface CreateSubscriptionCheckoutParams {
  creatorId: string;
  readerEmail: string;
  stripePriceId: string;
  tierId?: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string;
}

/**
 * Creates a Stripe Checkout Session for subscribing a reader to a creator's paid tier.
 */
export async function createSubscriptionCheckoutSession(
  params: CreateSubscriptionCheckoutParams
) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: params.stripeCustomerId ? undefined : params.readerEmail,
    customer: params.stripeCustomerId || undefined,
    line_items: [
      {
        price: params.stripePriceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      creatorId: params.creatorId,
      subscriberEmail: params.readerEmail,
      tierId: params.tierId || "",
    },
    subscription_data: {
      metadata: {
        creatorId: params.creatorId,
        subscriberEmail: params.readerEmail,
        tierId: params.tierId || "",
      },
    },
  });

  return session;
}

/**
 * Creates a Stripe Billing Portal Session for managing existing subscriptions.
 */
export async function createCustomerPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}) {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });

  return session;
}
