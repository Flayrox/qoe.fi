// =====================================================================
// 🤖 robots.txt — apps/tenants
// =====================================================================
// 📖 Génère automatiquement /robots.txt pour le SEO.
//    Indique aux moteurs de recherche quoi indexer ou pas.
// =====================================================================

import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'qoe.fi';
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
