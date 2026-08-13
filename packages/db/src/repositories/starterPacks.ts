// =====================================================================
// 🚀 Starter Packs Repository — Packs d'Abonnement Curés (1-Click Follow)
// =====================================================================

import { prisma } from '../client';

export interface CreateStarterPackInput {
  title: string;
  description?: string;
  icon?: string;
  creatorId: string;
  userIds: string[];
}

/**
 * 📦 Récupère la liste des Starter Packs disponibles.
 */
export async function getStarterPacks(limit = 20, cursor?: string) {
  const starterPacks = await prisma.starterPack.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          username: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      items: {
        take: 8,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
              heroText: true,
            },
          },
        },
      },
      _count: {
        select: {
          items: true,
        },
      },
    },
  });

  let nextCursor: string | null = null;
  if (starterPacks.length > limit) {
    const nextItem = starterPacks.pop();
    nextCursor = nextItem?.id || null;
  }

  return { starterPacks, nextCursor };
}

/**
 * 🔍 Récupère un Starter Pack détaillé par son ID.
 */
export async function getStarterPackById(id: string) {
  return prisma.starterPack.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          username: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      items: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              heroText: true,
              isCertified: true,
              _count: {
                select: {
                  followers: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          items: true,
        },
      },
    },
  });
}

/**
 * ➕ Crée un nouveau Starter Pack avec sa liste de membres.
 */
export async function createStarterPack(input: CreateStarterPackInput) {
  const { title, description, icon, creatorId, userIds } = input;

  const uniqueUserIds = Array.from(new Set(userIds)).filter((id) => id !== creatorId);

  return prisma.starterPack.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      icon: icon || '🚀',
      creatorId,
      items: {
        create: uniqueUserIds.map((userId) => ({
          userId,
        })),
      },
    },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
        },
      },
      items: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  });
}

/**
 * ⚡ Suit instantanément TOUS les membres d'un Starter Pack (1-Click Follow All).
 */
export async function followAllInStarterPack(readerId: string, starterPackId: string) {
  const pack = await prisma.starterPack.findUnique({
    where: { id: starterPackId },
    include: {
      items: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!pack) {
    throw new Error(`StarterPack with id ${starterPackId} not found`);
  }

  // Filtrer l'utilisateur courant
  const targetUserIds = pack.items
    .map((item) => item.userId)
    .filter((targetId) => targetId !== readerId);

  if (targetUserIds.length === 0) {
    return { followedCount: 0 };
  }

  // Création idempotente avec skipDuplicates
  const result = await prisma.follows.createMany({
    data: targetUserIds.map((creatorId) => ({
      readerId,
      creatorId,
    })),
    skipDuplicates: true,
  });

  return { followedCount: result.count };
}
