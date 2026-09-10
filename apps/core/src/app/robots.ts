// =====================================================================
// 🤖 robots.ts — apps/core (qoe.fi)
// =====================================================================
// Déclare les directives de crawl pour les moteurs de recherche.
// Autorise les contenus publics (articles, profils, feed d'accueil)
// et bloque l'indexation des données utilisateur privées et de l'API.
// =====================================================================

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/home', '/article/', '/search', '/starter-packs'],
        disallow: [
          '/api/',
          '/auth/',
          '/login',
          '/messages/',
          '/settings/',
          '/billing/',
          '/onboarding/',
          '/library/',
          '/history/',
          '/highlights/',
          '/notifications/',
          '/dashboard/',
          '/admin/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
