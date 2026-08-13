import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@qoe/db/client';

export const getRequestDbUser = cache(async (id: string) => {
  return await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      logoUrl: true,
      username: true,
      walletBalanceCents: true,
      onboardingText: true,
    },
  });
});

export const getCachedSystemConfig = unstable_cache(
  async () => {
    const configs = await prisma.systemConfig.findMany();
    return Object.fromEntries(configs.map((c) => [c.key, c.value]));
  },
  ['system-config'],
  {
    tags: ['system-config'],
    revalidate: 3600, // Cache for 1 hour fallback
  }
);

export const getCachedStandardArticles = unstable_cache(
  async () => {
    return await prisma.article.findMany({
      where: {
        published: true,
        author: { allowIndexing: true, isShadowbanned: false },
      },
      include: {
        author: {
          select: {
            name: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 9,
    });
  },
  ['standard-articles'],
  {
    tags: ['standard-articles'],
    revalidate: 1800, // Cache for 30 minutes fallback
  }
);
