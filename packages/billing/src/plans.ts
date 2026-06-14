// =====================================================================
// 📋 Plans & Pricing — Source unique
// =====================================================================

/**
 * 💰 Plan d'abonnement lecteur (s'abonner à un créateur).
 */
export const SUBSCRIPTION_TIERS = {
  FREE: {
    id: "free",
    name: "Gratuit",
    priceCents: 0,
    interval: null as null,
    features: [
      "Accès aux articles publics",
      "Abonnement à la newsletter",
    ],
  },
  PREMIUM: {
    id: "premium",
    name: "Premium",
    priceCents: 500, // 5€/mois
    interval: "month" as const,
    features: [
      "Tous les articles premium du créateur",
      "Contenu exclusif",
      "Surlignages et signets",
      "Soutien direct au créateur",
    ],
  },
} as const;

export type SubscriptionTierId = keyof typeof SUBSCRIPTION_TIERS;

/**
 * 🎨 Plans créateurs (ce que qoe.fi facture aux créateurs).
 */
export const CREATOR_PLANS = {
  FREE: {
    id: "creator_free",
    name: "Gratuit",
    feePercent: 10, // 10% de commission
    features: ["Profil public", "Jusqu'à 100 abonnés"],
  },
  PRO: {
    id: "creator_pro",
    name: "Pro",
    priceCents: 1900, // 19€/mois
    feePercent: 5,
    features: [
      "Commission réduite (5%)",
      "Abonnés illimités",
      "Custom domain",
      "Statistiques avancées",
      "Support prioritaire",
    ],
  },
} as const;

export type CreatorPlanId = keyof typeof CREATOR_PLANS;

/**
 * 🛒 Calcule la commission qoe.fi.
 */
export function calculateFee(
  amountCents: number,
  plan: CreatorPlanId = "FREE"
): number {
  const feePercent = CREATOR_PLANS[plan].feePercent;
  return Math.round((amountCents * feePercent) / 100);
}
