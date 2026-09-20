// =====================================================================
// 🗺️ sitemap.ts — apps/core (qoe.fi)
// =====================================================================
// Génère automatiquement /sitemap.xml pour l'indexation de qoe.fi.
// Récupère dynamiquement les articles récents et les profils créateurs
// depuis l'API Go avec mise en cache d'une heure (revalidate = 3600).
// =====================================================================

import type { MetadataRoute } from 'next';

export const revalidate = 3600; // Cache de 1 heure

// Le sitemap est PUBLIC et sans session : on appelle l'API Go en fetch
// direct, SANS goFetch (qui lit les cookies Supabase pour le Bearer —
// `cookies()` lève DynamicServerError pendant le (pré)rendu de
// /sitemap.xml, ce qui vidait silencieusement articles et créateurs).
const GO_API_URL = (process.env.QOE_API_URL || 'http://localhost:8090').replace(/\/$/, '');

async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GO_API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[sitemap] GET ${path}:`, err);
    return null;
  }
}

interface ApiArticleFeedResult {
  items: Array<{
    slug: string;
    createdAt?: string;
    author?: {
      username?: string | null;
      subdomain?: string | null;
    };
    publication?: {
      slug?: string | null;
      subdomain?: string | null;
    };
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

  // 2. Articles publiés récents (format canonique SEO /:owner/:slug)
  let articleEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await fetchPublic<ApiArticleFeedResult>('/v1/feed/articles?limit=100');
    if (res?.items && Array.isArray(res.items)) {
      articleEntries = res.items
        .filter((art) => Boolean(art.slug))
        .map((art) => {
          const owner =
            art.publication?.slug ||
            art.publication?.subdomain ||
            art.author?.username ||
            art.author?.subdomain ||
            'article';
          return {
            url: `${baseUrl}/${encodeURIComponent(owner)}/${encodeURIComponent(art.slug)}`,
            lastModified: art.createdAt ? new Date(art.createdAt) : new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
          };
        });
    }
  } catch (err) {
    console.error('[sitemap] Failed to fetch recent articles for sitemap:', err);
  }

  // 3. Profils de créateurs recommandés / publics
  let creatorEntries: MetadataRoute.Sitemap = [];
  try {
    const creators = await fetchPublic<ApiSuggestedCreator[]>('/v1/home/suggested-creators');
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
