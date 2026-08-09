/**
 * 📊 CREATOR FINANCIAL & AUDIENCE ANALYTICS ENGINE — @qoe/analytics
 */

import { prisma } from '@qoe/db';

export interface CreatorFinancialMetrics {
  mrrCents: number;
  arrCents: number;
  grossVolumeCents: number;
  activeSubscribersCount: number;
  freeSubscribersCount: number;
  conversionRatePercent: number;
}

export interface CreatorTopContentItem {
  id: string;
  title: string;
  type: 'article' | 'thought';
  publishedAt: Date | string;
  viewsCount: number;
  likesCount: number;
  repostsCount: number;
  revenueCents?: number;
}

export async function getCreatorFinancialMetrics(creatorId: string): Promise<CreatorFinancialMetrics> {
  const [activeSubscribers, freeSubscribersCount] = await Promise.all([
    prisma.subscriber.findMany({
      where: {
        creatorId,
        status: 'ACTIVE',
        isPremium: true,
      },
      select: {
        ltvCents: true,
        tier: {
          select: {
            monthlyPriceCents: true,
            yearlyPriceCents: true,
          },
        },
      },
    }),
    prisma.subscriber.count({
      where: {
        creatorId,
        isPremium: false,
      },
    }),
  ]);

  let mrrCents = 0;
  let grossVolumeCents = 0;

  activeSubscribers.forEach((sub: { ltvCents: number; tier: { monthlyPriceCents: number; yearlyPriceCents: number | null } | null }) => {
    grossVolumeCents += sub.ltvCents || 0;
    if (sub.tier) {
      mrrCents += sub.tier.monthlyPriceCents || 0;
    }
  });

  const arrCents = mrrCents * 12;
  const activeSubscribersCount = activeSubscribers.length;
  const totalAudience = activeSubscribersCount + freeSubscribersCount;

  const conversionRatePercent = totalAudience > 0
    ? Number(((activeSubscribersCount / totalAudience) * 100).toFixed(2))
    : 0;

  return {
    mrrCents,
    arrCents,
    grossVolumeCents,
    activeSubscribersCount,
    freeSubscribersCount,
    conversionRatePercent,
  };
}

export async function getCreatorTopContentStats(
  creatorId: string,
  limit: number = 5
): Promise<CreatorTopContentItem[]> {
  const [articles, thoughts] = await Promise.all([
    prisma.article.findMany({
      where: { authorId: creatorId, published: true },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.thought.findMany({
      where: { authorId: creatorId, isDraft: false, deletedAt: null },
      select: {
        id: true,
        content: true,
        createdAt: true,
        likeCount: true,
        repostCount: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);

  const articleItems: CreatorTopContentItem[] = articles.map((art: { id: string; title: string; createdAt: Date }) => ({
    id: art.id,
    title: art.title,
    type: 'article',
    publishedAt: art.createdAt,
    viewsCount: 0,
    likesCount: 0,
    repostsCount: 0,
  }));

  const thoughtItems: CreatorTopContentItem[] = thoughts.map((t: { id: string; content: string; createdAt: Date; likeCount: number; repostCount: number }) => ({
    id: t.id,
    title: t.content.slice(0, 60) + (t.content.length > 60 ? '...' : ''),
    type: 'thought',
    publishedAt: t.createdAt,
    viewsCount: 0,
    likesCount: t.likeCount || 0,
    repostsCount: t.repostCount || 0,
  }));

  return [...articleItems, ...thoughtItems]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}
