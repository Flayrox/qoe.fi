// =====================================================================
// 🗺️ Sitemap dynamique — apps/web
// =====================================================================

import type { MetadataRoute } from "next";
import { URLS } from "@qoe/config";

const BASE = URLS.LANDING;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];

  // Phase 8.5 : décommenter quand la migration sera complète
  // const [trendingArticles, suggestedCreators] = await Promise.all([
  //   findTrending(100),
  //   findSuggestedCreators(50),
  // ]);
  // ... génération dynamique

  return staticPages;
}
