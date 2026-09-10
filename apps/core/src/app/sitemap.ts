// =====================================================================
// 🗺️ sitemap.ts — apps/core (qoe.fi)
// =====================================================================
// Génère automatiquement /sitemap.xml pour l'indexation de qoe.fi.
// Récupère dynamiquement les articles récents et les profils créateurs
// depuis l'API Go avec mise en cache d'une heure (revalidate = 3600).
// =====================================================================

import type { MetadataRoute } from 'next';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export const revalidate = 3600; // Cache de 1 heure

interface ApiArticleFeedResult {
  items: Array<{
    slug: string;
    createdAt?: string;
  }>;
}

interface ApiSuggestedCreator {
  username?: string | null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');

  // 1. Pages statiques publiques principales
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/home`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/starter-packs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];

  // 2. Articles publiés récents
  let articleEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await goFetch<ApiArticleFeedResult>('/v1/feed/articles?limit=100');
    if (res?.items && Array.isArray(res.items)) {
      articleEntries = res.items
        .filter((art) => Boolean(art.slug))
        .map((art) => ({
          url: `${baseUrl}/article/${encodeURIComponent(art.slug)}`,
          lastModified: art.createdAt ? new Date(art.createdAt) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
        }));
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch recent articles for sitemap:', err);
  }

  // 3. Profils de créateurs recommandés / publics
  let creatorEntries: MetadataRoute.Sitemap = [];
  try {
    const creators = await goFetch<ApiSuggestedCreator[]>('/v1/home/suggested-creators');
    if (Array.isArray(creators)) {
      creatorEntries = creators
        .filter((c) => Boolean(c.username))
        .map((c) => ({
          url: `${baseUrl}/${encodeURIComponent(c.username!)}`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.7,
        }));
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch creators for sitemap:', err);
  }

  return [...staticPages, ...articleEntries, ...creatorEntries];
}
