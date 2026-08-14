import type { Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@qoe/db/client';
import { subscriptionsRepository } from '@qoe/db/repositories/subscriptions';
import { SubscriptionStatus } from '@prisma/client';
import { logger } from '@qoe/observability';
import { eventBus } from '../events/eventBus';

export interface StripeWebhookData {
  metadata?: {
    creatorId?: string;
    subscriberEmail?: string;
    tierId?: string | null;
  };
  customer_email?: string | null;
  status?: string;
  current_period_end?: number;
  id?: string;
  customer?: string | object;
  amount_paid?: number;
  [key: string]: unknown;
}

export interface StripeWebhookJobPayload {
  eventId: string;
  eventType: string;
  data: StripeWebhookData;
}

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

async function resolvePublicationId(creatorRef: string): Promise<string | null> {
  const direct = await prisma.publication.findUnique({
    where: { id: creatorRef },
    select: { id: true },
  });
  if (direct) return direct.id;

  const pub = await prisma.publication.findFirst({
    where: { type: 'PERSONAL', user: { id: creatorRef } },
    select: { id: true },
  });
  return pub?.id ?? null;
}

async function publishSubscriberCreated(publicationId: string, email: string) {
  try {
    await eventBus.publishSubscriberCreated({
      eventId: `sub_${publicationId}_${Date.now()}`,
      subscriberId: email,
      publicationId,
      creatorId: publicationId,
      email,
      isPremium: true,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Erreur publication événement subscriber.created', { err });
  }
}

export async function processStripeWebhookSyncJob(job: Job<StripeWebhookJobPayload>) {
  const { eventId, eventType, data } = job.data;

  // 1. Redis exact-once idempotency guard check
  const lockKey = `stripe:event:${eventId}`;
  try {
    const acquired = await redis.set(lockKey, 'processed', 'EX', 86400 * 7, 'NX');
    if (!acquired) {
      logger.info('Event déjà traité, skip', { eventId });
      return;
    }
  } catch {
    logger.warn('Redis lock check bypassé');
  }

  logger.info('Traitement événement Stripe', { eventId, eventType });

  switch (eventType) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const creatorRef = data.metadata?.creatorId;
      const email = data.metadata?.subscriberEmail || data.customer_email;
      const tierId = data.metadata?.tierId || null;

      if (!creatorRef || !email) {
        logger.warn('Événement Stripe sans metadata requise', { eventId });
        return;
      }

      const publicationId = await resolvePublicationId(creatorRef);
      if (!publicationId) {
        logger.warn('Publication introuvable pour le webhook Stripe', { creatorRef });
        return;
      }

      const statusMap: Record<string, SubscriptionStatus> = {
        active: SubscriptionStatus.ACTIVE,
        past_due: SubscriptionStatus.PAST_DUE,
        canceled: SubscriptionStatus.CANCELED,
        unpaid: SubscriptionStatus.UNPAID,
        incomplete: SubscriptionStatus.INCOMPLETE,
      };

      const status = data.status ? statusMap[data.status] : undefined;
      const resolvedStatus = status || SubscriptionStatus.ACTIVE;
      const isPremium = resolvedStatus === SubscriptionStatus.ACTIVE;
      const currentPeriodEnd = data.current_period_end
        ? new Date(data.current_period_end * 1000)
        : null;

      await subscriptionsRepository.upsertSubscriberEntitlement({
        publicationId,
        email,
        stripeSubscriptionId: data.id,
        stripeCustomerId: typeof data.customer === 'string' ? data.customer : null,
        status: resolvedStatus,
        isPremium,
        tierId,
        currentPeriodEnd,
      });

      if (eventType === 'customer.subscription.created' && isPremium) {
        await publishSubscriberCreated(publicationId, email);
      }

      logger.info('Entitlement mis à jour', { email, publicationId });
      break;
    }

    case 'customer.subscription.deleted': {
      const creatorRef = data.metadata?.creatorId;
      const email = data.metadata?.subscriberEmail;

      if (creatorRef && email) {
        const publicationId = await resolvePublicationId(creatorRef);
        if (publicationId) {
          await subscriptionsRepository.upsertSubscriberEntitlement({
            publicationId,
            email,
            status: SubscriptionStatus.CANCELED,
            isPremium: false,
          });
          logger.info('Abonnement annulé', { email, publicationId });
        }
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const creatorRef = data.metadata?.creatorId;
      const email = data.customer_email || data.metadata?.subscriberEmail;
      const amountPaid = data.amount_paid || 0;

      if (creatorRef && email && amountPaid > 0) {
        const publicationId = await resolvePublicationId(creatorRef);
        if (publicationId) {
          await subscriptionsRepository.upsertSubscriberEntitlement({
            publicationId,
            email,
            status: SubscriptionStatus.ACTIVE,
            isPremium: true,
            amountPaidCents: amountPaid,
          });
          logger.info('Paiement facture traité', { amountPaid, email, publicationId });
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const creatorRef = data.metadata?.creatorId;
      const email = data.customer_email || data.metadata?.subscriberEmail;

      if (creatorRef && email) {
        const publicationId = await resolvePublicationId(creatorRef);
        if (publicationId) {
          await subscriptionsRepository.upsertSubscriberEntitlement({
            publicationId,
            email,
            status: SubscriptionStatus.PAST_DUE,
            isPremium: false,
          });
          logger.warn('Paiement échoué, PAST_DUE', { email, publicationId });
        }
      }
      break;
    }

    default:
      logger.warn("Type d'événement Stripe non géré", { eventType });
  }
}
