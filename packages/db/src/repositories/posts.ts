// =====================================================================
// 📝 Posts Repository — Micro-posts (timeline)
// =====================================================================

import { prisma } from "../client";
import type { Post } from "@prisma/client";
import { POST_VISIBILITY } from "@qoe/config";

/**
 * 📰 Feed : posts des créateurs suivis par un user.
 */
export async function findFollowingFeed(
  readerId: string,
  options?: { take?: number; skip?: number }
) {
  // D'abord on récupère les follows
  const follows = await prisma.follows.findMany({
    where: { readerId },
    select: { creatorId: true },
  });
  const creatorIds = follows.map((f) => f.creatorId);

  if (creatorIds.length === 0) return [];

  return prisma.post.findMany({
    where: {
      authorId: { in: creatorIds },
      isDraft: false,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
      visibility: { in: [POST_VISIBILITY.PUBLIC, POST_VISIBILITY.FOLLOWERS] },
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: options?.take ?? 20,
    skip: options?.skip ?? 0,
    include: {
      author: {
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
      _count: { select: { likes: true, replies: true, reposts: true } },
      likes: { where: { userId: readerId }, select: { userId: true } },
    },
  });
}

/**
 * 🔥 Posts trending (les plus likés/relayés récemment).
 */
export async function findTrending(limit: number = 20) {
  return prisma.post.findMany({
    where: {
      isDraft: false,
      visibility: POST_VISIBILITY.PUBLIC,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // 7 derniers jours
      author: { isShadowbanned: false, isSuspended: false },
    },
    orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
    take: limit,
    include: {
      author: {
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
      _count: { select: { likes: true, replies: true, reposts: true } },
    },
  });
}

/**
 * ✍️ Crée un micro-post.
 */
export async function create(data: {
  content: string;
  authorId: string;
  tags?: string[];
  imageUrl?: string;
  visibility?: string;
}) {
  return prisma.post.create({
    data: {
      content: data.content,
      authorId: data.authorId,
      tags: data.tags ?? [],
      imageUrl: data.imageUrl,
      visibility: data.visibility ?? POST_VISIBILITY.PUBLIC,
    },
  });
}

/**
 * ❤️ Toggle like sur un post.
 * Retourne { liked: boolean, count: number }.
 */
export async function toggleLike(postId: string, userId: string) {
  const existing = await prisma.like.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.like.delete({
      where: { postId_userId: { postId, userId } },
    });
  } else {
    await prisma.like.create({ data: { postId, userId } });
  }

  const count = await prisma.like.count({ where: { postId } });
  return { liked: !existing, count };
}

export type { Post };
