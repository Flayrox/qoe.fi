import type { Job } from 'bullmq';
import { logger } from '@qoe/observability';
import { prisma, type Prisma } from '@qoe/db/client';
import { sliceContentAtPaywall } from '@qoe/utils';
import { isFlagOn } from '@qoe/flags/server';

export interface PublishNewsletterPayload {
  articleId: string;
  authorId: string;
  title: string;
  slug: string;
  visibility: 'PUBLIC' | 'MEMBERS_ONLY' | 'PAID_SUBSCRIBERS' | 'TIER_SPECIFIC';
}

export interface SubscriberBatchItem {
  id: string;
  email: string;
  isPremium: boolean;
  tierId: string | null;
}

const BATCH_SIZE = 500; // Batch recipients into chunks of 500

export async function processPublishNewsletterJob(job: Job<PublishNewsletterPayload>) {
  const { articleId, authorId, visibility } = job.data;

  // 🚩 Kill switch : coupe l'envoi des newsletters depuis le dashboard
  //    GrowthBook (workers-newsletter-dispatch) sans redéployer.
  const dispatchEnabled = await isFlagOn('workers-newsletter-dispatch', { articleId, authorId });
  if (!dispatchEnabled) {
    logger.warn('Newsletter mise en pause par feature flag', { articleId });
    return;
  }

  console.log(
    `[NewsletterWorker] Starting broadcast dispatch for article ${articleId} (${visibility})`
  );

  // 1. Fetch creator & article
  const [author, article] = await Promise.all([
    prisma.user.findUnique({ where: { id: authorId } }),
    prisma.article.findUnique({
      where: { id: articleId },
      select: { publicationId: true, content: true, visibility: true, tierId: true },
    }),
  ]);

  if (!author || !article) {
    console.error(
      `[NewsletterWorker] Author ${authorId} or Article ${articleId} not found. Halting.`
    );
    return;
  }

  // 2. Query target subscribers based on visibility
  const whereCondition: Prisma.SubscriberWhereInput = {
    publicationId: article.publicationId,
    isActive: true,
  };

  if (visibility === 'PAID_SUBSCRIBERS' || visibility === 'TIER_SPECIFIC') {
    whereCondition.isPremium = true;
  }

  if (visibility === 'TIER_SPECIFIC' && article.tierId) {
    whereCondition.tierId = article.tierId;
  }

  const subscribersCount = await prisma.subscriber.count({ where: whereCondition });
  logger.info("Nombre total d'abonnés cibles", { subscribersCount });

  if (subscribersCount === 0) {
    return;
  }

  // 3. Process recipients in batches of 500 using keyset/cursor pagination
  let processedCount = 0;
  let lastId: string | null = null;

  while (processedCount < subscribersCount) {
    const batch: SubscriberBatchItem[] = await prisma.subscriber.findMany({
      where: {
        ...whereCondition,
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        isPremium: true,
        tierId: true,
      },
    });

    if (batch.length === 0) break;
    const lastItem = batch[batch.length - 1];
    lastId = lastItem.id;

    for (const subscriber of batch) {
      // Apply server-side AST paywall cut per subscriber entitlement
      const cutResult = sliceContentAtPaywall(
        article.content,
        { isMember: true, isPaidSubscriber: subscriber.isPremium, tierId: subscriber.tierId },
        article.visibility,
        article.tierId
      );

      console.log(
        `[NewsletterWorker] Dispatched batch email to ${subscriber.email} (previewLength: ${cutResult.content.length} chars)`
      );
    }

    processedCount += batch.length;
    logger.info('Batch traité', { processedCount, subscribersCount });
  }

  logger.info('Newsletter terminée', { articleId });
}
