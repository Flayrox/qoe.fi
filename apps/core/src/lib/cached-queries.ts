import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@qoe/db/client';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

// GET /v1/me — profil lecteur Go (identité + compteurs bibliothèque).
export interface MeProfile {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  onboardingText: string | null;
  pronouns: string | null;
  role: string;
  walletBalanceCents: number;
  hasCompletedOnboarding: boolean;
  createdAt: string;
  followsCount: number;
  mutedWordsCount: number;
}

export const getRequestDbUser = cache(async (id: string) => {
  // Go en primaire (le JWT identifie l'utilisateur) — fallback Prisma en dev.
  try {
    const profile = await goFetch<MeProfile>('/v1/me');
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      logoUrl: profile.logoUrl,
      username: profile.username,
      walletBalanceCents: profile.walletBalanceCents,
      onboardingText: profile.onboardingText,
      hasCompletedOnboarding: profile.hasCompletedOnboarding,
    };
  } catch {
    // Fallback Prisma (dev sans QOE_API_URL) : lookup + sync email legacy.
  }

  let dbUser = await prisma.user.findUnique({
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
      hasCompletedOnboarding: true,
    },
  });

  if (!dbUser && id) {
    try {
      const { createClient } = await import('@qoe/supabase/server');
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.email && authUser.id === id) {
        const matchByEmail = await prisma.user.findFirst({
          where: { email: authUser.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            logoUrl: true,
            username: true,
            walletBalanceCents: true,
            onboardingText: true,
            hasCompletedOnboarding: true,
          },
        });
        if (matchByEmail) {
          await prisma.user.update({
            where: { id: matchByEmail.id },
            data: { id: authUser.id },
          });
          dbUser = { ...matchByEmail, id: authUser.id };
        }
      }
    } catch {
      // Ignore if server auth context not available
    }
  }

  return dbUser;
});

export const getCachedSystemConfig = unstable_cache(
  async () => {
    try {
      return await goFetch<Record<string, string>>('/v1/home/config');
    } catch {
      const configs = await prisma.systemConfig.findMany();
      return Object.fromEntries(configs.map((c) => [c.key, c.value]));
    }
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
        publication: { is: { allowIndexing: true } },
        author: { is: { isShadowbanned: false } },
      },
      include: {
        publication: {
          select: {
            id: true,
            type: true,
            name: true,
            slug: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            heroText: true,
            isCertified: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        coAuthors: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        attributions: {
          orderBy: { order: 'asc' as const },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                logoUrl: true,
                isCertified: true,
              },
            },
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

export const getCachedTrends = unstable_cache(
  async () => {
    try {
      return await goFetch<Array<{ id: string; hashtag: string; count: number }>>(
        '/v1/home/trends?limit=5'
      );
    } catch {
      return prisma.trend.findMany({
        orderBy: { count: 'desc' },
        take: 5,
      });
    }
  },
  ['home-widget-trends'],
  { revalidate: 120 }
);

export const getCachedPromos = unstable_cache(
  async () => {
    try {
      return await goFetch<
        Array<{
          id: string;
          title: string;
          description: string;
          ctaText: string | null;
          ctaUrl: string | null;
          imageUrl: string | null;
          isActive: boolean;
        }>
      >('/v1/home/promos?limit=3');
    } catch {
      return prisma.partnerPromo.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
    }
  },
  ['home-widget-promos'],
  { revalidate: 300 }
);

export const getCachedFeaturedArticle = unstable_cache(
  async () =>
    prisma.article.findFirst({
      where: { published: true, isEditorPick: true },
      include: {
        publication: {
          select: {
            id: true,
            type: true,
            name: true,
            slug: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            heroText: true,
            isCertified: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        coAuthors: {
          select: {
            id: true,
            name: true,
            username: true,
            logoUrl: true,
            isCertified: true,
          },
        },
        attributions: {
          orderBy: { order: 'asc' as const },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                logoUrl: true,
                isCertified: true,
              },
            },
          },
        },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ['home-widget-featured-article'],
  { revalidate: 120 }
);
