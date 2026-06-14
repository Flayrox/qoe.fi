// =====================================================================
// 📰 Articles Repository — Couche d'accès typée
// =====================================================================
// 📖 Plutôt que d'utiliser `prisma.article.findMany()` partout dans le code,
//    on encapsule les requêtes dans des fonctions typées. Bénéfices :
//    - 1 endroit pour optimiser les requêtes (includes, select)
//    - 1 endroit pour ajouter du cache (Redis, unstable_cache)
//    - Plus facile à tester (mock du repo)
// =====================================================================

import { prisma } from "../client";
import type { Article } from "@prisma/client";

/**
 * 📋 Liste les articles publiés d'un créateur.
 */
export async function findPublishedByAuthor(
  authorId: string,
  options?: { take?: number; skip?: number }
) {
  return prisma.article.findMany({
    where: { authorId, published: true },
    orderBy: { createdAt: "desc" },
    take: options?.take ?? 20,
    skip: options?.skip ?? 0,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
          subdomain: true,
          customDomain: true,
        },
      },
      category: { select: { name: true, slug: true } },
      _count: { select: { bookmarks: true, highlights: true } },
    },
  });
}

/**
 * 🔍 Trouve un article par son slug (lecture publique).
 */
export async function findBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
          subdomain: true,
          customDomain: true,
          heroText: true,
          accentColor: true,
        },
      },
      category: true,
    },
  });
}

/**
 * 📰 Articles trending (les plus lus/signets récemment).
 */
export async function findTrending(limit: number = 9) {
  return prisma.article.findMany({
    where: {
      published: true,
      author: { allowIndexing: true, isShadowbanned: false },
    },
    orderBy: [{ bookmarks: { _count: "desc" } }, { createdAt: "desc" }],
    take: limit,
    include: {
      author: {
        select: {
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      category: { select: { name: true } },
    },
  });
}

/**
 * ✍️ Crée un article (utilisé par le dashboard créateur).
 */
export async function create(data: {
  title: string;
  slug: string;
  content: string;
  authorId: string;
  categoryId?: string;
  isPremium?: boolean;
}) {
  return prisma.article.create({
    data: {
      ...data,
      readingTime: estimateReadingTime(data.content),
    },
  });
}

/**
 * ⏱️ Estime le temps de lecture d'un contenu.
 * Règle : 200 mots/minute (standard international).
 */
function estimateReadingTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, ""); // strip HTML
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export type { Article };
