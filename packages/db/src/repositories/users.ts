// =====================================================================
// 👤 Users Repository — Couche d'accès typée
// =====================================================================

import { prisma } from "../client";
import type { User } from "@prisma/client";
import { ROLES } from "@qoe/config";

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
 * 🔗 Trouve un user par subdomain ou custom domain (résolution tenant).
 */
export async function findByDomain(domain: string) {
  return prisma.user.findFirst({
    where: {
      OR: [{ subdomain: domain }, { customDomain: domain }],
    },
    include: {
      navigation: { orderBy: { order: "asc" } },
      socialLinks: { orderBy: { order: "asc" } },
    },
  });
}

/**
 * 🏷️ Trouve un user par username (pour les profils @user).
 */
export async function findByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      logoUrl: true,
      heroText: true,
      onboardingText: true,
      isCertified: true,
      subdomain: true,
      headerImageUrl: true,
      createdAt: true,
    },
  });
}

/**
 * 👥 Liste les créateurs "suggested" (certified + active).
 */
export async function findSuggestedCreators(limit: number = 10) {
  return prisma.user.findMany({
    where: {
      role: { in: [ROLES.CREATOR, ROLES.SUPERADMIN] },
      isCertified: true,
      isSuspended: false,
    },
    select: {
      id: true,
      name: true,
      username: true,
      subdomain: true,
      logoUrl: true,
      heroText: true,
      isCertified: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 🔍 Trouve un user par son ID avec données publiques seulement.
 */
export async function findPublicById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      logoUrl: true,
      heroText: true,
      isCertified: true,
      subdomain: true,
      customDomain: true,
    },
  });
}

export type { User };
