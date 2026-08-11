// =====================================================================
// 📝 Thoughts Repository — Micro-posts / Thoughts (timeline)
// =====================================================================

import { prisma } from "../client";
import type { Thought } from "@prisma/client";
import { POST_VISIBILITY } from "@qoe/config";

/**
 * 📰 Feed : pensées des créateurs suivis par un utilisateur.
 */
export async function findFollowingFeed(
  readerId: string,
  options?: { take?: number; skip?: number; cursor?: string }
) {
  const follows = await prisma.follows.findMany({
    where: { readerId },
    select: { creatorId: true },
  });
  const creatorIds = follows.map((f: any) => f.creatorId);

  if (creatorIds.length === 0) return [];

  const take = options?.take ?? 20;

  return prisma.thought.findMany({
    where: {
      authorId: { in: creatorIds },
      author: { isShadowbanned: false, isSuspended: false },
      isDraft: false,
      deletedAt: null,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
      visibility: { in: [POST_VISIBILITY.PUBLIC, POST_VISIBILITY.FOLLOWERS] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    cursor: options?.cursor ? { id: options.cursor } : undefined,
    skip: options?.cursor ? 1 : (options?.skip ?? 0),
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
      parent: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              subdomain: true,
              logoUrl: true,
              isCertified: true,
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
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              isCertified: true,
            },
          },
        },
      },
      attachments: { orderBy: { order: "asc" } },
      _count: { select: { likes: true, replies: true, reposts: true } },
      likes: { where: { userId: readerId }, select: { userId: true } },
    },
  });
}

/**
 * 🔥 Pensées trending (les plus likés/relayés récemment).
 */
export async function findTrending(limit: number = 20) {
  return prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      visibility: POST_VISIBILITY.PUBLIC,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      author: { isShadowbanned: false, isSuspended: false },
    },
    orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      attachments: { orderBy: { order: "asc" } },
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
      parent: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              subdomain: true,
              logoUrl: true,
              isCertified: true,
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
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              isCertified: true,
            },
          },
        },
      },
      _count: { select: { likes: true, replies: true, reposts: true } },
    },
  });
}


/**
 * ✍️ Crée une pensée (Thought) avec auteur inclus.
 */
import { recordHashtags } from "./search";

export async function createThought(data: {
  content: string;
  authorId: string;
  tags?: string[];
  imageUrl?: string | null;
  attachments?: Array<{ url: string; type?: string; altText?: string; order?: number }>;
  visibility?: string;
  isDraft?: boolean;
  scheduledAt?: Date | null;
  triggerWarning?: string | null;
  repostId?: string | null;
  parentId?: string | null;
  replyRestriction?: string;
}) {
  const newPost = await prisma.thought.create({
    data: {
      content: data.content,
      authorId: data.authorId,
      tags: data.tags ?? [],
      imageUrl: data.imageUrl || null,
      attachments:
        data.attachments && data.attachments.length > 0
          ? {
              create: data.attachments.map((att, idx) => ({
                url: att.url,
                type: att.type || "IMAGE",
                altText: att.altText || null,
                order: att.order ?? idx,
              })),
            }
          : undefined,
      visibility: data.visibility ?? POST_VISIBILITY.PUBLIC,
      isDraft: data.isDraft ?? false,
      scheduledAt: data.scheduledAt || null,
      triggerWarning: data.triggerWarning || null,
      repostId: data.repostId || null,
      parentId: data.parentId || null,
      replyRestriction: data.replyRestriction || "everyone",
    },
    include: {
      attachments: { orderBy: { order: "asc" } },
      author: {
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          heroText: true,
          username: true,
          isCertified: true,
        },
      },
      repost: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              username: true,
              isCertified: true,
            },
          },
        },
      },
    },
  });

  if (data.tags && data.tags.length > 0) {
    recordHashtags(data.tags).catch((err) => console.error("Error recording hashtags:", err));
  }

  return newPost;
}



/** @deprecated Utiliser createThought */
export const createMicroPost = createThought;

/**
 * ❤️ Toggle like sur une pensée canonique.
 */
import { createNotification, deleteNotification } from "./notifications";

export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean }> {
  const canonicalId = await getCanonicalPostId(postId);

  try {
    const targetPost = await prisma.thought.findUnique({
      where: { id: canonicalId },
      select: { authorId: true },
    });

    const existing = await prisma.like.findUnique({
      where: { postId_userId: { postId: canonicalId, userId } },
    });

    if (existing) {
      await prisma.$transaction([
        prisma.like.delete({ where: { id: existing.id } }),
        prisma.thought.update({
          where: { id: canonicalId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      if (targetPost?.authorId) {
        deleteNotification({
          recipientId: targetPost.authorId,
          senderId: userId,
          type: "LIKE",
          thoughtId: canonicalId,
        }).catch((err) => console.error("Error deleting like notification:", err));
      }
      return { liked: false };
    } else {
      await prisma.$transaction([
        prisma.like.create({ data: { postId: canonicalId, userId } }),
        prisma.thought.update({
          where: { id: canonicalId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      if (targetPost?.authorId) {
        createNotification({
          recipientId: targetPost.authorId,
          senderId: userId,
          type: "LIKE",
          thoughtId: canonicalId,
        }).catch((err) => console.error("Error creating like notification:", err));
      }
      return { liked: true };
    }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { liked: true };
    }
    throw error;
  }
}

/**
 * 💬 Réponse à une pensée.
 */
export async function replyToPost(postId: string, authorId: string, content: string) {
  const targetPost = await prisma.thought.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });

  const [reply] = await prisma.$transaction([
    prisma.thought.create({
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
    }),
    prisma.thought.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
    }),
  ]);

  if (targetPost?.authorId) {
    createNotification({
      recipientId: targetPost.authorId,
      senderId: authorId,
      type: "REPLY",
      thoughtId: reply.id,
    }).catch((err) => console.error("Error creating reply notification:", err));
  }

  // Parse mentions (@username)
  const mentions = content.match(/@([a-zA-Z0-9_]+)/g);
  if (mentions && mentions.length > 0) {
    const usernames = Array.from(new Set(mentions.map((m) => m.slice(1))));
    prisma.user
      .findMany({
        where: { username: { in: usernames } },
        select: { id: true },
      })
      .then((mentionedUsers) => {
        for (const u of mentionedUsers) {
          if (u.id !== authorId && u.id !== targetPost?.authorId) {
            createNotification({
              recipientId: u.id,
              senderId: authorId,
              type: "MENTION",
              thoughtId: reply.id,
            }).catch((err) => console.error("Error creating mention notification:", err));
          }
        }
      })
      .catch((err) => console.error("Error finding mentioned users:", err));
  }

  return reply;
}


/**
 * 🧵 Trouve le thread d'une pensée par ID avec calcul canonique des likes/reposts.
 */
export async function findThreadById(postId: string, currentUserId?: string | null) {
  const authorSelect = {
    select: {
      id: true,
      name: true,
      username: true,
      logoUrl: true,
      isCertified: true,
      subdomain: true,
      customDomain: true,
    },
  };

  const likesInclude = { select: { userId: true } };
  const repostsInclude = currentUserId
    ? { where: { authorId: currentUserId, deletedAt: null }, select: { id: true, authorId: true } }
    : false;
  const countSelect = { select: { likes: true, replies: true, reposts: true } };

  const thread = await prisma.thought.findUnique({
    where: { id: postId },
    include: {
      author: authorSelect,
      likes: likesInclude,
      reposts: repostsInclude,
      _count: countSelect,
      parent: {
        include: {
          author: authorSelect,
          likes: likesInclude,
          reposts: repostsInclude,
          _count: countSelect,
          parent: {
            include: {
              author: authorSelect,
              likes: likesInclude,
              reposts: repostsInclude,
              _count: countSelect,
            },
          },
        },
      },
      repost: {
        include: {
          author: authorSelect,
          likes: likesInclude,
          reposts: repostsInclude,
          _count: countSelect,
        },
      },
      replies: {
        include: {
          author: authorSelect,
          likes: likesInclude,
          reposts: repostsInclude,
          _count: countSelect,
          replies: {
            include: {
              author: authorSelect,
              likes: likesInclude,
              reposts: repostsInclude,
              _count: countSelect,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!thread) return null;

  // 🛡️ Helper de sanitisation & transformation de nœuds de thread
  const processPostNode = (node: any): any => {
    if (!node) return null;

    if (node.deletedAt) {
      node.content = "Cette pensée a été supprimée par son auteur.";
      node.imageUrl = null;
      node.isDeleted = true;
    }

    const canonicalNode = node.repost || node;

    const liked = currentUserId
      ? (Array.isArray(canonicalNode.likes) && canonicalNode.likes.some((l: any) => l.userId === currentUserId)) ||
        (Array.isArray(node.likes) && node.likes.some((l: any) => l.userId === currentUserId))
      : false;

    const reposted = currentUserId
      ? (Array.isArray(canonicalNode.reposts) && canonicalNode.reposts.length > 0) ||
        (Array.isArray(node.reposts) && node.reposts.length > 0)
      : false;

    node.liked = liked;
    node.reposted = reposted;
    node.likesCount = canonicalNode.likeCount ?? canonicalNode._count?.likes ?? node._count?.likes ?? 0;
    node.repliesCount = canonicalNode.replyCount ?? canonicalNode._count?.replies ?? node._count?.replies ?? 0;
    node.repostsCount = canonicalNode.repostCount ?? canonicalNode._count?.reposts ?? node._count?.reposts ?? 0;

    if (node.parent) {
      node.parent = processPostNode(node.parent);
    }
    if (node.replies && Array.isArray(node.replies)) {
      node.replies = node.replies.map(processPostNode);
    }

    return node;
  };

  return processPostNode(thread);
}

/**
 * 🔄 Résolution canonique de l'ID d'origine (pour éviter les chaînes de reposts).
 */
export async function getCanonicalPostId(postId: string): Promise<string> {
  const target = await prisma.thought.findUnique({
    where: { id: postId },
    select: { id: true, repostId: true },
  });
  if (!target) return postId;
  return target.repostId || target.id;
}

/**
 * 🔄 Bascule Repost / Un-repost atomique (Clic 1 = Republier, Clic 2 = Annuler).
 */
export async function toggleRepost(postId: string, authorId: string): Promise<{ reposted: boolean; canonicalId: string; post?: any }> {
  const canonicalId = await getCanonicalPostId(postId);

  // Recherche de tous les pure reposts existants par le même utilisateur
  const existingReposts = await prisma.thought.findMany({
    where: {
      authorId,
      repostId: canonicalId,
      deletedAt: null,
      OR: [{ content: "" }, { content: " " }],
    },
    select: { id: true },
  });

  if (existingReposts.length > 0) {
    // UN-REPOST ATOMIQUE : suppression de tous les doublons de repost et décrémentation
    await prisma.$transaction([
      prisma.thought.deleteMany({
        where: { id: { in: existingReposts.map((r) => r.id) } },
      }),
      prisma.thought.update({
        where: { id: canonicalId },
        data: { repostCount: { decrement: existingReposts.length } },
      }),
    ]);
    return { reposted: false, canonicalId };
  } else {
    // REPOST : création du pure repost canonique unique et incrémentation atomique
    const [newRepost] = await prisma.$transaction([
      prisma.thought.create({
        data: {
          content: "",
          authorId,
          repostId: canonicalId,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              heroText: true,
              isCertified: true,
            },
          },
          repost: {
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
            },
          },
        },
      }),
      prisma.thought.update({
        where: { id: canonicalId },
        data: { repostCount: { increment: 1 } },
      }),
    ]);
    return { reposted: true, canonicalId, post: newRepost };
  }
}

/** @deprecated Utiliser toggleRepost */
export async function repostPost(postId: string, authorId: string) {
  const res = await toggleRepost(postId, authorId);
  return res.post;
}

/**
 * 🗑️ Supprime une pensée après vérification de l'auteur.
 */
export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  const post = await prisma.thought.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== authorId) return false;

  await prisma.thought.update({
    where: { id: postId },
    data: { deletedAt: new Date() },
  });
  return true;
}

/**
 * 📝 Récupère les brouillons d'un utilisateur.
 */
export async function getUserDrafts(authorId: string) {
  return prisma.thought.findMany({
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
 * 📌 Épingle ou désépingle une pensée sur le profil de l'utilisateur.
 */
export async function setPinStatus(postId: string, authorId: string, isPinned: boolean): Promise<boolean> {
  const post = await prisma.thought.findUnique({ where: { id: postId } });
  if (!post || post.authorId !== authorId) return false;

  if (isPinned) {
    await prisma.thought.updateMany({
      where: { authorId, isPinned: true },
      data: { isPinned: false },
    });
  }

  await prisma.thought.update({
    where: { id: postId },
    data: { isPinned },
  });

  return true;
}

export type { Thought };
