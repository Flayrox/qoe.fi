// =====================================================================
// 🗺️ sitemap.ts — apps/core (qoe.fi)
// =====================================================================
// INDEX de sitemaps shardé (modèle "catalogue complet" : chaque article
// publié est couvert, même à des milliers/milliers, comme les tweets) :
//   /sitemap.xml                  → index (statique + créateurs + shards)
//   /sitemap/articles-{n}.xml     → 1000 articles par shard (catalogue slim
//                                    /v1/seo/sitemap-articles, sans contenu)
//
// Cache d'une heure (revalidate = 3600).
// =====================================================================

import type { MetadataRoute } from 'next';

export const revalidate = 3600; // Cache de 1 heure

// Taille d'un shard d'articles (limite protocole : 50 000 URLs / 50 Mo ;
// 1000 garde chaque shard léger et régénérable vite).
const SHARD_SIZE = 1000;
// Plafond de shards (1M d'articles couverts — largement au-delà du besoin,
// sous la limite protocole de 50 000 sitemaps par index).
const MAX_SHARDS = 1000;

// Le sitemap est PUBLIC et sans session : on appelle l'API Go en fetch
// direct, SANS goFetch (qui lit les cookies Supabase pour le Bearer —
// `cookies()` lève DynamicServerError pendant le (pré)rendu de
// /sitemap.xml, ce qui vidait silencieusement articles et créateurs).
const GO_API_URL = (process.env.QOE_API_URL || 'http://localhost:8090').replace(/\/$/, '');

async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    // next.revalidate (pas no-store) : le prerender de build reste possible
    // (API injoignable au build → null gracieux), puis régénération horaire.
    const res = await fetch(`${GO_API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[sitemap] GET ${path}:`, err);
    return null;
  }
}

interface SitemapCatalog {
  items: Array<{ slug: string; owner: string; updatedAt?: string }>;
  total: number;
}

interface ApiSuggestedCreator {
  username?: string | null;
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
}

function staticPages(): MetadataRoute.Sitemap {
  const base = baseUrl();
  return [
    {
      url: `${base}/home`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${base}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${base}/starter-packs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}

async function creatorEntries(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  try {
    const creators = await fetchPublic<ApiSuggestedCreator[]>('/v1/home/suggested-creators');
    if (!Array.isArray(creators)) return [];
    return creators
      .filter((c) => Boolean(c.username))
      .map((c) => ({
        url: `${base}/${encodeURIComponent(c.username!)}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      }));
  } catch (err) {
    console.error('[sitemap] Failed to fetch creators for sitemap:', err);
    return [];
  }
}

async function articleEntries(offset: number, limit: number): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  try {
    const res = await fetchPublic<SitemapCatalog>(
      `/v1/seo/sitemap-articles?limit=${limit}&offset=${offset}`
    );
    if (!res?.items || !Array.isArray(res.items)) return [];
    return res.items
      .filter((art) => Boolean(art.slug) && Boolean(art.owner))
      .map((art) => ({
        url: `${base}/${encodeURIComponent(art.owner)}/${encodeURIComponent(art.slug)}`,
        lastModified: art.updatedAt ? new Date(art.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      }));
  } catch (err) {
    console.error('[sitemap] Failed to fetch articles shard for sitemap:', err);
    return [];
  }
}

async function articleShardCount(): Promise<number> {
  try {
    const res = await fetchPublic<SitemapCatalog>('/v1/seo/sitemap-articles?limit=1&offset=0');
    const total = res && typeof res.total === 'number' ? res.total : 0;
    return Math.min(Math.max(Math.ceil(total / SHARD_SIZE), 1), MAX_SHARDS);
  } catch {
    return 1;
  }
}

// Dimensionne l'index : id 0 = pages statiques, id 1 = créateurs,
// id >= 2 = shards d'articles (shard n → id n+2). Les ids DOIVENT être
// numériques (exigence Next.js generateSitemaps) : /sitemap.xml (index)
// + /sitemap/<id>.xml.
export async function generateSitemaps() {
  const shards = await articleShardCount();
  return [{ id: 0 }, { id: 1 }, ...Array.from({ length: shards }, (_, i) => ({ id: i + 2 }))];
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  if (id === 1) return creatorEntries();
  if (Number.isInteger(id) && id >= 2 && id < MAX_SHARDS + 2) {
    return articleEntries((id - 2) * SHARD_SIZE, SHARD_SIZE);
  }
  if (id === 0) return staticPages();
  return [];
}
