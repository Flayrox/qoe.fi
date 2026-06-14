// =====================================================================
// 🗺️ Sitemap dynamique — apps/web
// =====================================================================
// 📖 Génère automatiquement /sitemap.xml pour le SEO.
//    Liste TOUS les articles publiés + landing + creators.
//
// 📖 Next.js génère ce fichier à chaque build (ou en runtime si dynamic).
//    Les moteurs de recherche l'utilisent pour indexer ton site.
// =====================================================================

import type { MetadataRoute } from "next";
import { findTrending } from "@qoe/db/repositories/articles";
import { findSuggestedCreators } from "@qoe/db/repositories/users";
import { URLS } from "@qoe/config";

const BASE = URLS.LANDING;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Pages statiques
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];

  // Articles trending
  const articles = await findTrending(100);
  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE}/article/${a.slug}`, // à adapter quand on aura les vrais liens
    lastModified: a.updatedAt ?? a.createdAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Pages créateurs
  const creators = await findSuggestedCreators(50);
  const creatorPages: MetadataRoute.Sitemap = creators.map((c) => ({
    url: c.subdomain ? `https://${c.subdomain}.qoe.fi` : `${BASE}/@${c.username}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticPages, ...articlePages, ...creatorPages];
}
