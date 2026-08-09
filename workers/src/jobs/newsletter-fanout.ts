/**
 * 📧 NEWSLETTER BATCH FAN-OUT WORKER JOB — @qoe/workers
 *
 * Dispatches published articles to creator subscribers in chunked batches (500/chunk).
 * Applies server-side AST paywall truncation for free tier subscribers.
 */

import { Job } from 'bullmq';
import { prisma } from '@qoe/db';
import { truncateArticleContentForPaywall } from '@qoe/billing';

export interface NewsletterFanoutJobData {
  articleId: string;
  creatorId: string;
  batchSize?: number;
}

export interface NewsletterFanoutResult {
  articleId: string;
  totalSubscribersSent: number;
  freeCount: number;
  paidCount: number;
  chunksCount: number;
}

export async function processNewsletterFanout(
  job: Job<NewsletterFanoutJobData>
): Promise<NewsletterFanoutResult> {
  const { articleId, creatorId, batchSize = 500 } = job.data;

  // 1. Fetch article & author details
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          subdomain: true,
        },
      },
    },
  });

  if (!article || !article.published) {
    throw new Error(`Article ${articleId} not found or not published.`);
  }

  // 2. Fetch all creator subscribers directly
  const subscribers = await prisma.subscriber.findMany({
    where: { creatorId },
    select: {
      id: true,
      email: true,
      isPremium: true,
      status: true,
    },
  });

  if (subscribers.length === 0) {
    return {
      articleId,
      totalSubscribersSent: 0,
      freeCount: 0,
      paidCount: 0,
      chunksCount: 0,
    };
  }

  // 3. Prepare truncated versions for free vs paid subscribers
  const freeVersion = truncateArticleContentForPaywall(article.content, {
    isPremium: article.isPremium,
    isSubscriber: false,
  });

  const paidVersion = truncateArticleContentForPaywall(article.content, {
    isPremium: article.isPremium,
    isSubscriber: true,
  });

  let freeCount = 0;
  let paidCount = 0;

  // 4. Batch subscribers into chunks of 500
  const chunks: Array<typeof subscribers> = [];
  for (let i = 0; i < subscribers.length; i += batchSize) {
    chunks.push(subscribers.slice(i, i + batchSize));
  }

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];

    for (const sub of chunk) {
      const isPaidSubscriber = sub.isPremium && sub.status === 'ACTIVE';
      const targetContent = isPaidSubscriber ? paidVersion.content : freeVersion.content;

      if (isPaidSubscriber) {
        paidCount++;
      } else {
        freeCount++;
      }

      // Simulated email dispatch boundary
      // In production: sendgrid / resend batch API call with targetContent
    }

    await job.updateProgress(Math.round(((chunkIndex + 1) / chunks.length) * 100));
  }

  return {
    articleId,
    totalSubscribersSent: subscribers.length,
    freeCount,
    paidCount,
    chunksCount: chunks.length,
  };
}
