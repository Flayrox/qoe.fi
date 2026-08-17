// =====================================================================
// 👥 Follows Repository — Suivi des Publications (personnel OU média)
// =====================================================================

import { prisma } from '../client';
import { createNotification, deleteNotification } from './notifications';
import { logger } from '@qoe/observability';

/**
 * 🏢 Retourne le User propriétaire d'une publication
 * (PERSONAL → le créateur, MEDIA → le membre owner du média).
 */
export async function getPublicationOwner(publicationId: string): Promise<string | null> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    select: {
      type: true,
      user: { select: { id: true } },
      media: {
        select: {
          members: {
            where: { role: 'owner', status: 'active' },
            select: { userId: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!publication) return null;
  if (publication.type === 'MEDIA') {
    return publication.media?.members?.[0]?.userId ?? null;
  }
  return publication.user?.id ?? null;
}

/**
 * ⚡ Bascule l'état d'abonnement d'un lecteur envers une publication.
 */
export async function toggleFollow(
  readerId: string,
  publicationId: string
): Promise<{ followed: boolean }> {
  try {
    const existing = await prisma.follows.findUnique({
      where: {
        readerId_publicationId: {
          readerId,
          publicationId,
        },
      },
    });

    const ownerId = await getPublicationOwner(publicationId);

    if (existing) {
      await prisma.follows.deleteMany({
        where: { readerId, publicationId },
      });
      if (ownerId) {
        deleteNotification({
          recipientId: ownerId,
          senderId: readerId,
          type: 'FOLLOW',
        }).catch((err) => logger.error('Erreur suppression notification follow', { err }));
      }
      return { followed: false };
    } else {
      await prisma.follows.create({
        data: {
          readerId,
          publicationId,
        },
      });
      if (ownerId) {
        createNotification({
          recipientId: ownerId,
          senderId: readerId,
          type: 'FOLLOW',
          publicationId,
        }).catch((err) => logger.error('Erreur création notification follow', { err }));
      }
      return { followed: true };
    }
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { followed: true };
    if ((error as { code?: string })?.code === 'P2025') return { followed: false };
    throw error;
  }
}

/**
 * 🔍 Vérifie si un lecteur suit une publication.
 */
export async function isFollowing(readerId: string, publicationId: string): Promise<boolean> {
  const existing = await prisma.follows.findUnique({
    where: {
      readerId_publicationId: {
        readerId,
        publicationId,
      },
    },
  });
  return !!existing;
}

/**
 * 📊 Compte le nombre d'abonnés d'une publication.
 */
export async function countFollowers(publicationId: string): Promise<number> {
  return prisma.follows.count({ where: { publicationId } });
}

/**
 * 📊 Compte le nombre d'abonnements d'un utilisateur.
 */
export async function countFollowing(readerId: string): Promise<number> {
  return prisma.follows.count({ where: { readerId } });
}

/**
 * 🧑‍🤝‍🧑 Acteur d'une liste d'abonnés/abonnements (profil).
 */
export interface FollowActorDTO {
  id: string;
  publicationId: string | null;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  followedAt: string;
  viewerFollows: boolean;
}

/**
 * 📄 Liste les abonnés d'une publication (paginé).
 */
export async function listFollowers(
  publicationId: string,
  viewerId: string | null,
  opts: { limit?: number; offset?: number } = {}
): Promise<FollowActorDTO[]> {
  const { limit = 50, offset = 0 } = opts;
  const rows = await prisma.follows.findMany({
    where: { publicationId },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    select: {
      createdAt: true,
      reader: {
        select: {
          id: true,
          name: true,
          username: true,
          publication: { select: { id: true, subdomain: true, logoUrl: true, isCertified: true } },
        },
      },
    },
  });

  // Publications suivies par le viewer, pour calculer viewerFollows.
  const viewerFollowsSet = new Set<string>();
  if (viewerId) {
    const vf = await prisma.follows.findMany({
      where: { readerId: viewerId },
      select: { publicationId: true },
    });
    vf.forEach((f) => viewerFollowsSet.add(f.publicationId));
  }

  return rows.map((row) => ({
    id: row.reader.id,
    publicationId: row.reader.publication?.id ?? null,
    name: row.reader.name,
    username: row.reader.username,
    subdomain: row.reader.publication?.subdomain ?? null,
    logoUrl: row.reader.publication?.logoUrl ?? null,
    isCertified: row.reader.publication?.isCertified ?? false,
    followedAt: row.createdAt.toISOString(),
    viewerFollows: viewerId ? viewerFollowsSet.has(row.reader.publication?.id ?? '') : false,
  }));
}

/**
 * 📄 Liste les abonnements d'un utilisateur (propriétaire d'une publication).
 * Résout vers les publications PERSONAL suivies (avec leur propriétaire).
 */
export async function listFollowing(
  readerId: string,
  viewerId: string | null,
  opts: { limit?: number; offset?: number } = {}
): Promise<FollowActorDTO[]> {
  const { limit = 50, offset = 0 } = opts;
  const rows = await prisma.follows.findMany({
    where: { readerId },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    select: {
      createdAt: true,
      publication: {
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          logoUrl: true,
          isCertified: true,
          type: true,
          user: { select: { id: true, name: true, username: true } },
        },
      },
    },
  });

  const viewerFollowsSet = new Set<string>();
  if (viewerId) {
    const vf = await prisma.follows.findMany({
      where: { readerId: viewerId },
      select: { publicationId: true },
    });
    vf.forEach((f) => viewerFollowsSet.add(f.publicationId));
  }

  return rows
    .filter((row) => row.publication.type === 'PERSONAL' && row.publication.user)
    .map((row) => {
      const pub = row.publication;
      return {
        id: pub.user!.id,
        publicationId: pub.id,
        name: pub.user!.name ?? pub.name,
        username: pub.user!.username ?? pub.slug,
        subdomain: pub.subdomain,
        logoUrl: pub.logoUrl,
        isCertified: pub.isCertified,
        followedAt: row.createdAt.toISOString(),
        viewerFollows: viewerId ? viewerFollowsSet.has(pub.id) : false,
      };
    });
}

/**
 * 📄 Retourne les IDs des publications suivies par un lecteur.
 */
export async function getFollowedPublicationIds(readerId: string): Promise<string[]> {
  const follows = await prisma.follows.findMany({
    where: { readerId },
    select: { publicationId: true },
  });
  return follows.map((f) => f.publicationId);
}

/**
 * 👤 Retourne les IDs des Users propriétaires des publications PERSONAL suivies.
 * (Utile pour les feeds de Thoughts, qui sont portés par des Users.)
 */
export async function getFollowedUserIds(readerId: string): Promise<string[]> {
  const pubIds = await getFollowedPublicationIds(readerId);
  if (pubIds.length === 0) return [];
  const pubs = await prisma.publication.findMany({
    where: { id: { in: pubIds }, type: 'PERSONAL' },
    select: { user: { select: { id: true } } },
  });
  return pubs.map((p) => p.user?.id).filter(Boolean) as string[];
}
