// =====================================================================
// 👥 Follows Repository — Couche d'accès typée
// =====================================================================

import { prisma } from '../client';
import { createNotification, deleteNotification } from './notifications';

/**
 * ⚡ Bascule l'état d'abonnement d'un lecteur envers un créateur.
 */
export async function toggleFollow(
  readerId: string,
  creatorId: string
): Promise<{ followed: boolean }> {
  try {
    const existing = await prisma.follows.findUnique({
      where: {
        readerId_creatorId: {
          readerId,
          creatorId,
        },
      },
    });

    if (existing) {
      await prisma.follows.deleteMany({
        where: { readerId, creatorId },
      });
      deleteNotification({
        recipientId: creatorId,
        senderId: readerId,
        type: 'FOLLOW',
      }).catch((err) => console.error('Error deleting follow notification:', err));
      return { followed: false };
    } else {
      await prisma.follows.create({
        data: {
          readerId,
          creatorId,
        },
      });
      createNotification({
        recipientId: creatorId,
        senderId: readerId,
        type: 'FOLLOW',
      }).catch((err) => console.error('Error creating follow notification:', err));
      return { followed: true };
    }
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { followed: true };
    if ((error as { code?: string })?.code === 'P2025') return { followed: false };
    throw error;
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
        creatorId,
      },
    },
  });
  return !!existing;
}

/**
 * 📊 Compte le nombre d'abonnés d'un créateur.
 */
export async function countFollowers(creatorId: string): Promise<number> {
  return prisma.follows.count({ where: { creatorId } });
}

/**
 * 📊 Compte le nombre d'abonnements d'un utilisateur.
 */
export async function countFollowing(readerId: string): Promise<number> {
  return prisma.follows.count({ where: { readerId } });
}
