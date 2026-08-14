// =====================================================================
// 👤 Users Repository — Couche d'accès typée
// =====================================================================
// 📖 Depuis le polymorphisme Publication, les profils publics / tenant
//    sont résolus via la Publication de l'utilisateur. Ce repo conserve
//    les helpers "personnes" (mention @, recherche) côté User.
// =====================================================================

import { prisma } from '../client';
import type { User } from '@prisma/client';
import { ROLES } from '@qoe/config';
import { getOrCreatePersonalPublication } from './publications';

/**
 * 👤 Trouve un user par son email.
 */
export async function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

/**
 * 🆔 Trouve un user par son ID (UUID).
 */
export async function findById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

/**
 * 🔗 Résout une publication (personnelle OU média) par subdomain ou custom domain.
 * Polymorphe : utilisée par le web tenant.
 */
export async function findByDomain(domain: string) {
  return prisma.publication.findFirst({
    where: {
      OR: [{ subdomain: domain }, { customDomain: domain }],
    },
    include: {
      navigation: { orderBy: { order: 'asc' } },
      socialLinks: { orderBy: { order: 'asc' } },
      user: true,
    },
  });
}

/**
 * 🏷️ Trouve un user par username (pour les profils @user).
 */
export async function findByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { publication: true },
  });
  if (!user) return null;
  return {
    ...user,
    heroText: user.publication?.heroText ?? null,
    headerImageUrl: user.publication?.headerImageUrl ?? null,
    subdomain: user.publication?.subdomain ?? null,
  };
}

/**
 * 👥 Liste les créateurs "suggested" (certified + active) — résolus via leurs publications.
 */
export async function findSuggestedCreators(limit: number = 10) {
  return prisma.publication.findMany({
    where: {
      type: 'PERSONAL',
      isCertified: true,
      user: {
        is: {
          role: { in: [ROLES.CREATOR, ROLES.SUPERADMIN] },
          isSuspended: false,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      subdomain: true,
      logoUrl: true,
      heroText: true,
      isCertified: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 🔍 Trouve la publication publique d'un user par son ID.
 */
export async function findPublicById(userId: string) {
  const publication = await getOrCreatePersonalPublication(userId);
  return prisma.publication.findUnique({
    where: { id: publication.id },
    select: {
      id: true,
      name: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      logoUrl: true,
      heroText: true,
      isCertified: true,
    },
  });
}

/**
 * 🔍 Recherche des utilisateurs par username ou nom pour l'autocomplétion des mentions @.
 */
export async function searchUsers(query: string, limit: number = 8) {
  if (!query || !query.trim()) return [];
  const q = query.trim().replace(/^@/, '');
  return prisma.user.findMany({
    where: {
      isSuspended: false,
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      username: true,
      logoUrl: true,
      isCertified: true,
    },
    take: limit,
    orderBy: { isCertified: 'desc' },
  });
}

export type { User };
