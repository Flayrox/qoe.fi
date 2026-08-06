// =====================================================================
// 🔖 Bookmarks Repository — Couche d'accès typée
// =====================================================================

import { prisma } from "../client"

/**
 * ⚡ Bascule l'état de mise en favori d'un article pour un lecteur.
 */
export async function toggleBookmark(readerId: string, articleId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.bookmark.findUnique({
    where: {
      readerId_articleId: {
        readerId,
        articleId
      }
    }
  })

  if (existing) {
    await prisma.bookmark.delete({
      where: { id: existing.id }
    })
    return { bookmarked: false }
  } else {
    await prisma.bookmark.create({
      data: {
        readerId,
        articleId
      }
    })
    return { bookmarked: true }
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
