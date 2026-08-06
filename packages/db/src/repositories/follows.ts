// =====================================================================
// 👥 Follows Repository — Couche d'accès typée
// =====================================================================

import { prisma } from "../client"

/**
 * ⚡ Bascule l'état d'abonnement d'un lecteur envers un créateur.
 */
export async function toggleFollow(readerId: string, creatorId: string): Promise<{ followed: boolean }> {
  const existing = await prisma.follows.findUnique({
    where: {
      readerId_creatorId: {
        readerId,
        creatorId
      }
    }
  })

  if (existing) {
    await prisma.follows.delete({
      where: { id: existing.id }
    })
    return { followed: false }
  } else {
    await prisma.follows.create({
      data: {
        readerId,
        creatorId
      }
    })
    return { followed: true }
  }
}

/**
 * 🔍 Vérifie si un lecteur suit un créateur.
 */
export async function isFollowing(readerId: string, creatorId: string): Promise<boolean> {
  const existing = await prisma.follows.findUnique({
    where: {
      readerId_creatorId: {
        readerId,
        creatorId
      }
    }
  })
  return !!existing
}

/**
 * 📊 Compte le nombre d'abonnés d'un créateur.
 */
export async function countFollowers(creatorId: string): Promise<number> {
  return prisma.follows.count({ where: { creatorId } })
}

/**
 * 📊 Compte le nombre d'abonnements d'un utilisateur.
 */
export async function countFollowing(readerId: string): Promise<number> {
  return prisma.follows.count({ where: { readerId } })
}
