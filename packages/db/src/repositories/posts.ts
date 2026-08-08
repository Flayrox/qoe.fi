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
  const follows = await prisma.follows.findMany({
    where: { readerId },
    select: { creatorId: true },
  });
  const creatorIds = follows.map((f: any) => f.creatorId);

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
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
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
 * ✍️ Crée un micro-post avec auteur inclus.
 */
export async function createMicroPost(data: {
  content: string;
  authorId: string;
  tags?: string[];
  imageUrl?: string | null;
  visibility?: string;
  isDraft?: boolean;
  scheduledAt?: Date | null;
  triggerWarning?: string | null;
}) {
  return prisma.post.create({
    data: {
      content: data.content,
      authorId: data.authorId,
      tags: data.tags ?? [],
      imageUrl: data.imageUrl || null,
      visibility: data.visibility ?? POST_VISIBILITY.PUBLIC,
      isDraft: data.isDraft ?? false,
      scheduledAt: data.scheduledAt || null,
      triggerWarning: data.triggerWarning || null,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          heroText: true,
          username: true,
        },
      },
    },
  });
}

/**
 * ❤️ Toggle like sur un post.
 */
export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean }> {
  const existing = await prisma.like.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.like.delete({
      where: { id: existing.id },
    });
    return { liked: false };
  } else {
    await prisma.like.create({
      data: { postId, userId },
    });
    return { liked: true };
  }
}

/**
 * 💬 Réponse à un post.
 */
export async function replyToPost(postId: string, authorId: string, content: string) {
  return prisma.post.create({
    data: {
      content,
      authorId,
      parentId: postId,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
    },
  });
}

/**
 * 🧵 Trouve le thread d'un post par ID.
 */
export async function findThreadById(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
          subdomain: true,
          customDomain: true,
        },
      },
      likes: { select: { userId: true } },
      parent: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
              subdomain: true,
              customDomain: true,
            },
          },
          _count: { select: { likes: true, replies: true } },
          parent: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  logoUrl: true,
                  isCertified: true,
                  subdomain: true,
                  customDomain: true,
                },
              },
            },
          },
        },
      },
      repost: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
              subdomain: true,
              customDomain: true,
            },
          },
        },
      },
      replies: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
              subdomain: true,
              customDomain: true,
            },
          },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, replies: true } },
          replies: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  logoUrl: true,
                  isCertified: true,
                  subdomain: true,
                  customDomain: true,
                },
              },
              _count: { select: { likes: true, replies: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/**
 * 🔄 Repost (Partage) d'un post.
 */
export async function repostPost(postId: string, authorId: string) {
  return prisma.post.create({
    data: {
      content: "",
      authorId,
      repostId: postId,
    },
  });
}

/**
 * 🗑️ Supprime un post après vérification de l'auteur.
 */
export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== authorId) return false;

  await prisma.post.delete({ where: { id: postId } });
  return true;
}

/**
 * 📝 Récupère les brouillons d'un utilisateur.
 */
export async function getUserDrafts(authorId: string) {
  return prisma.post.findMany({
    where: { authorId, isDraft: true },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * 📌 Épingle ou désépingle un post sur le profil de l'utilisateur.
 */
export async function setPinStatus(postId: string, authorId: string, isPinned: boolean): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== authorId) return false;

  if (isPinned) {
    await prisma.post.updateMany({
      where: { authorId, isPinned: true },
      data: { isPinned: false },
    });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { isPinned },
  });

  return true;
}

export type { Post };
