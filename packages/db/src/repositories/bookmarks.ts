// =====================================================================
// 🔖 Bookmarks Repository — Couche d'accès typée
// =====================================================================

import { prisma } from "../client"

/**
 * ⚡ Bascule l'état de mise en favori d'un article pour un lecteur.
 */
export async function toggleBookmark(readerId: string, articleId: string): Promise<{ bookmarked: boolean }> {
  try {
    const existing = await prisma.bookmark.findUnique({
      where: {
        readerId_articleId: {
          readerId,
          articleId,
        },
      },
    });

    if (existing) {
      await prisma.bookmark.deleteMany({
        where: { readerId, articleId },
      });
      return { bookmarked: false };
    } else {
      await prisma.bookmark.create({
        data: {
          readerId,
          articleId,
        },
      });
      return { bookmarked: true };
    }
  } catch (error: any) {
    if (error?.code === "P2002") return { bookmarked: true };
    if (error?.code === "P2025") return { bookmarked: false };
    throw error;
  }
}

/**
 * 🔍 Vérifie si un article est mis en favori par un lecteur.
 */
export async function isBookmarked(readerId: string, articleId: string): Promise<boolean> {
  const existing = await prisma.bookmark.findUnique({
    where: {
      readerId_articleId: {
        readerId,
        articleId
      }
    }
  })
  return !!existing
}
