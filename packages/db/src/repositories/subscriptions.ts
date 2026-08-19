// =====================================================================
// 💳 Subscriptions Repository — Droits d'accès & entités d'abonnement
// =====================================================================
// - getReaderEntitlement : résout l'état d'accès d'un lecteur (membre /
//   abonné payant) pour une publication — utilisé par le paywall.
// - upsertSubscriberEntitlement : alimenté par les webhooks Stripe ; crédite
//   aussi le wallet du propriétaire de la publication à chaque paiement.
// - getCreatorTiers : offres d'abonnement d'un créateur.
// ⚠️ Côté mobile, l'équivalent est servie par l'API Go
//    (apps/api/internal/modules/billing) et le paywall article
//    (apps/api/internal/modules/articles/paywall.go).
// =====================================================================

import { prisma } from '../client';
import { SubscriptionStatus } from '@prisma/client';
import { getPublicationOwner } from './follows';

export interface EntitlementCheckResult {
  isMember: boolean;
  isPaidSubscriber: boolean;
  tierId: string | null;
  status: SubscriptionStatus | null;
}

export const subscriptionsRepository = {
  /**
   * Resolves the subscription entitlement state of a reader for a specific publication.
   */
  async getReaderEntitlement(
    publicationId: string,
    readerEmail?: string | null,
    readerUserId?: string | null
  ): Promise<EntitlementCheckResult> {
    if (!readerEmail && !readerUserId) {
      return { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
    }

    const subscriber = await prisma.subscriber.findFirst({
      where: {
        publicationId,
        OR: [
          ...(readerEmail ? [{ email: readerEmail.toLowerCase().trim() }] : []),
          ...(readerUserId ? [{ userId: readerUserId }] : []),
        ],
      },
      include: {
        tier: true,
      },
    });

    if (!subscriber) {
      return { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
    }

    const isPaidSubscriber =
      subscriber.isPremium &&
      subscriber.status === SubscriptionStatus.ACTIVE &&
      (!subscriber.currentPeriodEnd || subscriber.currentPeriodEnd > new Date());

    return {
      isMember: subscriber.isActive,
      isPaidSubscriber,
      tierId: subscriber.tierId,
      status: subscriber.status,
    };
  },

  /**
   * Idempotently upserts subscriber entitlement records received from Stripe webhooks.
   */
  async upsertSubscriberEntitlement(params: {
    publicationId: string;
    email: string;
    userId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    status: SubscriptionStatus;
    isPremium: boolean;
    tierId?: string | null;
    currentPeriodEnd?: Date | null;
    amountPaidCents?: number;
  }) {
    const email = params.email.toLowerCase().trim();

    return prisma.$transaction(async (tx) => {
      const subscriber = await tx.subscriber.upsert({
        where: {
          email_publicationId: {
            email,
            publicationId: params.publicationId,
          },
        },
        update: {
          status: params.status,
          isPremium: params.isPremium,
          ...(params.userId ? { userId: params.userId } : {}),
          ...(params.stripeSubscriptionId
            ? { stripeSubscriptionId: params.stripeSubscriptionId }
            : {}),
          ...(params.stripeCustomerId ? { stripeCustomerId: params.stripeCustomerId } : {}),
          ...(params.tierId ? { tierId: params.tierId } : {}),
          ...(params.currentPeriodEnd !== undefined
            ? { currentPeriodEnd: params.currentPeriodEnd }
            : {}),
          ...(params.amountPaidCents ? { ltvCents: { increment: params.amountPaidCents } } : {}),
        },
        create: {
          email,
          publicationId: params.publicationId,
          userId: params.userId,
          status: params.status,
          isPremium: params.isPremium,
          stripeSubscriptionId: params.stripeSubscriptionId,
          stripeCustomerId: params.stripeCustomerId,
          tierId: params.tierId,
          currentPeriodEnd: params.currentPeriodEnd,
          ltvCents: params.amountPaidCents || 0,
        },
      });

      // Si un paiement a eu lieu, créditer le wallet du propriétaire de la publication
      if (params.amountPaidCents && params.amountPaidCents > 0) {
        const ownerId = await getPublicationOwner(params.publicationId);
        if (ownerId) {
          await tx.user.update({
            where: { id: ownerId },
            data: {
              walletBalanceCents: { increment: params.amountPaidCents },
            },
          });
        }
      }

      return subscriber;
    });
  },

  /**
   * Lists active subscription tiers created by a publication.
   */
  async getCreatorTiers(publicationId: string) {
    return prisma.tier.findMany({
      where: { publicationId },
      orderBy: { monthlyPriceCents: 'asc' },
    });
  },
};
