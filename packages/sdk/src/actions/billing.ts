'use server';

// =====================================================================
// 💳 actions/billing — encaissement (Checkout, portail, formules)
// =====================================================================
// Proxy fin vers Go : aucun prix, aucune commission et aucune URL de retour
// ne sont calculés côté client. Le backend renvoie une URL Stripe prête.
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';

export interface BillingTier {
  id: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number | null;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  publisherId: string;
}

/** Formules publiques d'une publication (paywall, page d'offre). */
export const getCreatorTiersAction = safeAction<{ publisherId: string }, { tiers: BillingTier[] }>(
  async ({ publisherId }) =>
    goFetch<{ tiers: BillingTier[] }>(
      `/v1/billing/tiers?publisherId=${encodeURIComponent(publisherId)}`
    ),
  { requireAuth: false }
);

export interface CreateTierInput {
  publisherId: string;
  name: string;
  description?: string;
  monthlyPriceCents: number;
  yearlyPriceCents?: number | null;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}

/** Crée une formule (le créateur doit gérer la publication). */
export const createCreatorTierAction = safeAction<CreateTierInput, BillingTier>(
  async ({ publisherId, ...input }) =>
    goFetch<BillingTier>(`/v1/billing/tiers?publisherId=${encodeURIComponent(publisherId)}`, {
      method: 'POST',
      body: input,
    })
);

export interface StartCheckoutInput {
  /** « plus » = bundle lecteur ; « publication » = formule d'un créateur. */
  plan: 'plus' | 'publication';
  publisherId?: string;
  tierId?: string;
  /** Cadence de facturation (« month » par défaut côté Go). */
  interval?: 'month' | 'year';
}

/** Ouvre une session Stripe Checkout et renvoie l'URL de redirection. */
export const startSubscriptionCheckoutAction = safeAction<StartCheckoutInput, { url: string }>(
  async (input) =>
    goFetch<{ url: string }>('/v1/billing/checkout', {
      method: 'POST',
      body: input,
    })
);

/** Ouvre le parcours d'onboarding Stripe Connect pour une publication. */
export const startStripeConnectAction = safeAction<
  { publisherId: string },
  { url: string; stripeAccountId: string }
>(async ({ publisherId }) =>
  goFetch<{ url: string; stripeAccountId: string }>(
    `/v1/billing/connect?publisherId=${encodeURIComponent(publisherId)}`,
    { method: 'POST', body: {} }
  )
);

/** Portail de facturation (changer de carte, résilier). */
export const openBillingPortalAction = safeAction<void, { url: string }>(async () =>
  goFetch<{ url: string }>('/v1/billing/portal', { method: 'POST', body: {} })
);
