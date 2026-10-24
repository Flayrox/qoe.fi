// =====================================================================
// 🗺️ sitemap.ts — apps/hi (hi.qoe.fi)
// =====================================================================
// Déclare la sitemap de la vitrine marketing qoefi.
// =====================================================================

import type { MetadataRoute } from 'next';
import { fetchLegalDocuments } from '@qoe/sdk/actions/legal';
import { toPublicLegalSlug } from '@qoe/config/legal';

export const revalidate = 86400; // Cache 24 heures

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/support`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/legal`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];

  try {
    const docs = await fetchLegalDocuments('fr');
    for (const doc of docs) {
      const publicSlug = toPublicLegalSlug(doc.slug);
      entries.push({
        url: `${baseUrl}/legal/${encodeURIComponent(publicSlug)}`,
        lastModified: doc.updatedAt ? new Date(doc.updatedAt) : now,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }
  } catch {
    // Repli silencieux si l'API est indisponible
  }

  return entries;
}
