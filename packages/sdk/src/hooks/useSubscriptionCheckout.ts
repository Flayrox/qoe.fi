/**
 * 💳 PORTABLE SUBSCRIPTION CHECKOUT HOOKS — @qoe/sdk
 *
 * Provides decoupled hooks for initiating Stripe Checkout sessions and Customer Portal redirections.
 * Zero dependency on DOM or web UI frameworks (mobile-ready).
 */

import { useMutation, useQuery } from '@tanstack/react-query';

export interface CheckoutSessionInput {
  creatorId: string;
  readerEmail: string;
  stripePriceId: string;
  tierId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string | null;
}

export interface CustomerPortalInput {
  stripeCustomerId: string;
  returnUrl: string;
}

export interface CustomerPortalResult {
  url: string;
}

export interface CreatorTier {
  id: string;
  creatorId: string;
  name: string;
  description?: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents?: number | null;
  stripePriceIdMonthly?: string | null;
  stripePriceIdYearly?: string | null;
}

/**
 * Mutation hook for initiating a Stripe Checkout session.
 */
export function useCreateCheckoutSession() {
  return useMutation<CheckoutSessionResult, Error, CheckoutSessionInput>({
    mutationFn: async (input) => {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Échec de la création de la session de paiement.');
      }

      return response.json();
    },
  });
}

/**
 * Mutation hook for generating a Stripe Customer Billing Portal redirection URL.
 */
export function useCustomerPortal() {
  return useMutation<CustomerPortalResult, Error, CustomerPortalInput>({
    mutationFn: async (input) => {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Échec de la génération du portail abonné.');
      }

      return response.json();
    },
  });
}

/**
 * Query hook for fetching active publication subscription tiers for a creator.
 */
export function useCreatorTiers(creatorId: string | undefined | null) {
  return useQuery<CreatorTier[], Error>({
    queryKey: ['subscriptionTiers', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const response = await fetch(`/api/billing/tiers?creatorId=${encodeURIComponent(creatorId)}`);
      if (!response.ok) {
        throw new Error("Échec du chargement des formules d'abonnement.");
      }
      const data = await response.json();
      return data.tiers || [];
    },
    enabled: Boolean(creatorId),
    staleTime: 5 * 60 * 1000,
  });
}
