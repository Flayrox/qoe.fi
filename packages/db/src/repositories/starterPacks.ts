// =====================================================================
// 🚀 Starter Packs Repository — Packs d'Abonnement Curés (1-Click Follow)
// =====================================================================

import { prisma } from '../client';

export interface CreateStarterPackInput {
  title: string;
  description?: string;
  icon?: string;
  publicationId: string;
  userIds: string[];
}

const publicationSelect = {
  id: true,
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  logoUrl: true,
  isCertified: true,
} as const;

/**
 * 📦 Récupère la liste des Starter Packs disponibles.
 */
export async function getStarterPacks(limit = 20, cursor?: string) {
  const starterPacks = await prisma.starterPack.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      publication: { select: publicationSelect },
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
      publication: { select: publicationSelect },
      items: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
              publication: {
                select: {
                  id: true,
                  slug: true,
                  subdomain: true,
                  _count: { select: { followers: true } },
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
  const { title, description, icon, publicationId, userIds } = input;

  const uniqueUserIds = Array.from(new Set(userIds));

  return prisma.starterPack.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      icon: icon || '🚀',
      publicationId,
      items: {
        create: uniqueUserIds.map((userId) => ({
          userId,
        })),
      },
    },
    include: {
      publication: { select: publicationSelect },
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
 * ⚡ Suit instantanément TOUTES les publications des membres d'un Starter Pack (1-Click Follow All).
 */
export async function followAllInStarterPack(readerId: string, starterPackId: string) {
  const pack = await prisma.starterPack.findUnique({
    where: { id: starterPackId },
    include: {
      items: {
        select: {
          user: { select: { publicationId: true } },
        },
      },
    },
  });

  if (!pack) {
    throw new Error(`StarterPack with id ${starterPackId} not found`);
  }

  // Résout la publication personnelle de chaque membre
  const targetPublicationIds = pack.items
    .map((item) => item.user.publicationId)
    .filter((pubId): pubId is string => Boolean(pubId));

  if (targetPublicationIds.length === 0) {
    return { followedCount: 0 };
  }

  // Création idempotente avec skipDuplicates
  const result = await prisma.follows.createMany({
    data: targetPublicationIds.map((publicationId) => ({
      readerId,
      publicationId,
    })),
    skipDuplicates: true,
  });

  return { followedCount: result.count };
}
