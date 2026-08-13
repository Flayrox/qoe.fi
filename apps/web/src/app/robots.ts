// =====================================================================
// 🤖 robots.txt — apps/web
// =====================================================================
// 📖 Génère automatiquement /robots.txt pour le SEO.
//    Indique aux moteurs de recherche quoi indexer ou pas.
// =====================================================================

import type { MetadataRoute } from 'next';
import { URLS } from '@qoe/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${URLS.LANDING}/sitemap.xml`,
  };
}
