// =====================================================================
// 🤖 robots.txt — apps/hi (hi.qoe.fi)
// =====================================================================
// Directives de crawl pour la vitrine marketing qoe.fi.
// Indexation totale autorisée pour maximiser le référencement.
// =====================================================================

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
