// =====================================================================
// 🗺️ sitemap.ts — apps/tenants (*.qoe.fi & domaines personnalisés)
// =====================================================================
// Génère automatiquement /sitemap.xml pour chaque blog tenant.
// Résout la publication et la liste des articles publiés pour l'hôte actif.
// =====================================================================

import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { parseTenantHost } from '@qoe/config';
import { fetchTenantPublication } from '@/lib/tenant-data';

export const revalidate = 3600; // Cache 1 heure

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  const { subdomain, isSystemDomain } = parseTenantHost(host);
  const targetDomain = !isSystemDomain && subdomain ? subdomain : host;

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];

  if (!targetDomain) return staticPages;

  try {
    const pub = await fetchTenantPublication(targetDomain);
    if (!pub) return staticPages;
    if (pub.allowIndexing === false) {
      return [];
    }

    const articlePages: MetadataRoute.Sitemap = (pub.articles || [])
      .filter((art) => art.published !== false && Boolean(art.slug))
      .map((art) => ({
        url: `${baseUrl}/article/${encodeURIComponent(art.slug)}`,
        lastModified: art.createdAt ? new Date(art.createdAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      }));

    return [...staticPages, ...articlePages];
  } catch (err) {
    console.error('[tenants/sitemap] Error generating tenant sitemap:', err);
    return staticPages;
  }
}
