import { prisma } from '../client';
import { SubscriptionStatus } from '@prisma/client';

export interface EntitlementCheckResult {
  isMember: boolean;
  isPaidSubscriber: boolean;
  tierId: string | null;
  status: SubscriptionStatus | null;
}

export const subscriptionsRepository = {
  /**
   * Resolves the subscription entitlement state of a reader for a specific creator.
   */
  async getReaderEntitlement(
    creatorId: string,
    readerEmail?: string | null,
    readerUserId?: string | null
  ): Promise<EntitlementCheckResult> {
    if (!readerEmail && !readerUserId) {
      return { isMember: false, isPaidSubscriber: false, tierId: null, status: null };
    }

    const subscriber = await prisma.subscriber.findFirst({
      where: {
        creatorId,
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
    creatorId: string;
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
          email_creatorId: {
            email,
            creatorId: params.creatorId,
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
          creatorId: params.creatorId,
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

      // If a payment occurred, credit creator wallet balance
      if (params.amountPaidCents && params.amountPaidCents > 0) {
        await tx.user.update({
          where: { id: params.creatorId },
          data: {
            walletBalanceCents: { increment: params.amountPaidCents },
          },
        });
      }

      return subscriber;
    });
  },

  /**
   * Lists active subscription tiers created by a creator.
   */
  async getCreatorTiers(creatorId: string) {
    return prisma.tier.findMany({
      where: { creatorId },
      orderBy: { monthlyPriceCents: 'asc' },
    });
  },
};
