// =====================================================================
// 🗺️ sitemap.ts — apps/hi (hi.qoe.fi)
// =====================================================================
// Déclare la sitemap de la vitrine marketing qoe.fi.
// =====================================================================

import type { MetadataRoute } from 'next';

export const revalidate = 86400; // Cache 24 heures

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];
}
