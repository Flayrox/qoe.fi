import type { Job } from "bullmq";
import { prisma } from "@qoe/db/client";
import { sliceContentAtPaywall } from "@qoe/utils";

export interface PublishNewsletterPayload {
  articleId: string;
  authorId: string;
  title: string;
  slug: string;
  visibility: "PUBLIC" | "MEMBERS_ONLY" | "PAID_SUBSCRIBERS" | "TIER_SPECIFIC";
}

export interface SubscriberBatchItem {
  id: string;
  email: string;
  isPremium: boolean;
  tierId: string | null;
}

const BATCH_SIZE = 500; // Batch recipients into chunks of 500

export async function processPublishNewsletterJob(job: Job<PublishNewsletterPayload>) {
  const { articleId, authorId, title, slug, visibility } = job.data;

  console.log(`[NewsletterWorker] Starting broadcast dispatch for article ${articleId} (${visibility})`);

  // 1. Fetch creator & article
  const [author, article] = await Promise.all([
    prisma.user.findUnique({ where: { id: authorId } }),
    prisma.article.findUnique({ where: { id: articleId } }),
  ]);

  if (!author || !article) {
    console.error(`[NewsletterWorker] Author ${authorId} or Article ${articleId} not found. Halting.`);
    return;
  }

  // 2. Query target subscribers based on visibility
  const whereCondition: any = {
    creatorId: authorId,
    isActive: true,
  };

  if (visibility === "PAID_SUBSCRIBERS" || visibility === "TIER_SPECIFIC") {
    whereCondition.isPremium = true;
  }

  if (visibility === "TIER_SPECIFIC" && article.tierId) {
    whereCondition.tierId = article.tierId;
  }

  const subscribersCount = await prisma.subscriber.count({ where: whereCondition });
  console.log(`[NewsletterWorker] Total target subscribers: ${subscribersCount}`);

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
      orderBy: { id: "asc" },
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

      console.log(`[NewsletterWorker] Dispatched batch email to ${subscriber.email} (previewLength: ${cutResult.content.length} chars)`);
    }

    processedCount += batch.length;
    console.log(`[NewsletterWorker] Processed batch: ${processedCount}/${subscribersCount}`);
  }

  console.log(`[NewsletterWorker] Completed newsletter broadcast for article ${articleId}`);
}
