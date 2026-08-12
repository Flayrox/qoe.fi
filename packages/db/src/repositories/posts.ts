// =====================================================================
// 📝 Thoughts Repository — Micro-posts / Thoughts (timeline)
// =====================================================================

import { prisma } from "../client";
import type { Thought } from "@prisma/client";
import { POST_VISIBILITY } from "@qoe/config";

export interface FeedSlice {
  id: string;
  rootPost?: any;
  parentPost?: any;
  targetPost: any;
  isIncompleteThread: boolean;
  hiddenIntermediateCount?: number;
}

export async function buildFeedSlices(rawPosts: any[], currentUserId?: string): Promise<FeedSlice[]> {
  const missingIds = new Set<string>();
  for (const p of rawPosts) {
    if (p.parentId) missingIds.add(p.parentId);
    if (p.rootId && p.rootId !== p.parentId) missingIds.add(p.rootId);
  }

  const extraPosts = new Map<string, any>();
  if (missingIds.size > 0) {
    const extras = await prisma.thought.findMany({
      where: { id: { in: Array.from(missingIds) } },
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
        poll: {
          include: {
            options: {
              orderBy: { order: "asc" },
              include: { _count: { select: { votes: true } } },
            },
            votes: { select: { optionId: true, userId: true } },
          },
        },
        _count: { select: { likes: true, replies: true, reposts: true } },
        likes: currentUserId ? { where: { userId: currentUserId }, select: { userId: true } } : false,
        reposts: currentUserId ? { where: { authorId: currentUserId, deletedAt: null }, select: { id: true } } : false,
      },
    });

    for (const e of extras) {
      extraPosts.set(e.id, {
        ...e,
        poll: formatPollData(e.poll, currentUserId),
      });
    }
  }

  const allSlices = rawPosts.map((p) => {
    const targetPost = { ...p, poll: formatPollData(p.poll, currentUserId) };
    const parentPost = p.parentId ? extraPosts.get(p.parentId) : undefined;
    const rootPost = p.rootId && p.rootId !== p.parentId ? extraPosts.get(p.rootId) : undefined;

    let isIncompleteThread = false;
    let hiddenIntermediateCount = 0;
    if (parentPost && p.rootId) {
      if (parentPost.parentId !== p.rootId && parentPost.id !== p.rootId) {
        isIncompleteThread = true;
        hiddenIntermediateCount = Math.max(1, (targetPost.replyCount || 1));
      }
    }

    return {
      id: p.id,
      rootPost,
      parentPost,
      targetPost,
      isIncompleteThread,
      hiddenIntermediateCount,
    };
  });

  // 🧵 Bluesky dedupThreads: deduplicate by thread root to render 1 slice per conversation
  const seenRootIds = new Set<string>();
  return allSlices.filter((slice) => {
    const conversationRootId = slice.rootPost?.id || slice.targetPost.rootId || slice.parentPost?.id || slice.targetPost.id;
    if (seenRootIds.has(conversationRootId)) {
      return false; // Discard redundant slice for a conversation thread already represented
    }
    seenRootIds.add(conversationRootId);
    return true;
  });
}



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

  const rawPosts = await prisma.thought.findMany({
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
      poll: {
        include: {
          options: {
            orderBy: { order: "asc" },
            include: { _count: { select: { votes: true } } },
          },
          votes: { select: { optionId: true, userId: true } },
        },
      },
      _count: { select: { likes: true, replies: true, reposts: true } },
      likes: { where: { userId: readerId }, select: { userId: true } },
      reposts: { where: { authorId: readerId, deletedAt: null }, select: { id: true } },
    },
  });

  return buildFeedSlices(rawPosts, readerId);
}

export function formatPollData(rawPoll: any, currentUserId?: string | null) {
  if (!rawPoll) return null;
  const totalVotes = rawPoll.options ? rawPoll.options.reduce((acc: number, opt: any) => acc + (opt._count?.votes || 0), 0) : 0;
  const isExpired = new Date() > new Date(rawPoll.expiresAt);
  const userVote = currentUserId && Array.isArray(rawPoll.votes) ? rawPoll.votes.find((v: any) => v.userId === currentUserId) : null;

  const options = (rawPoll.options || []).map((opt: any) => {
    const voteCount = opt._count?.votes ?? 0;
    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    return {
      id: opt.id,
      text: opt.text,
      order: opt.order,
      voteCount,
      percentage,
    };
  });

  return {
    id: rawPoll.id,
    thoughtId: rawPoll.thoughtId,
    expiresAt: rawPoll.expiresAt,
    isExpired,
    totalVotes,
    userVotedOptionId: userVote ? userVote.optionId : null,
    options,
  };
}

/**
 * 🔥 Pensées trending (les plus likés/relayés récemment).
 */
export async function findTrending(limit: number = 20, currentUserId?: string) {
  const rawPosts = await prisma.thought.findMany({
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
      poll: {
        include: {
          options: {
            orderBy: { order: "asc" },
            include: { _count: { select: { votes: true } } },
          },
          votes: { select: { optionId: true, userId: true } },
        },
      },
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
      likes: currentUserId ? { where: { userId: currentUserId }, select: { userId: true } } : false,
      reposts: currentUserId ? { where: { authorId: currentUserId, deletedAt: null }, select: { id: true } } : false,
    },
  });

  return buildFeedSlices(rawPosts, currentUserId);
}


/**
 * ✍️ Crée une pensée (Thought) avec auteur inclus.
 */
import { recordHashtags } from "./search";
import { canUserReplyToThought } from "./threadgates";

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
  let computedRootId: string | null = null;
  if (data.parentId) {
    const replyCheck = await canUserReplyToThought(data.parentId, data.authorId);
    if (!replyCheck.canReply) {
      throw new Error(replyCheck.reason || "THREADGATE_RESTRICTED");
    }
    const parentPost = await prisma.thought.findUnique({
      where: { id: data.parentId },
      select: { id: true, rootId: true },
    });
    if (parentPost) {
      computedRootId = parentPost.rootId || parentPost.id;
    }
  }

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
      rootId: computedRootId,
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
 * 🧵 Crée un fil complet de pensées (Thread) de manière atomique sous transaction SQL.
 */
export async function createThoughtThread(
  authorId: string,
  data: {
    thoughts: Array<{
      content: string;
      tags?: string[];
      imageUrl?: string | null;
      attachments?: Array<{ url: string; type?: string; altText?: string; order?: number }>;
      triggerWarning?: string | null;
      poll?: { options: string[]; durationHours?: number } | null;
    }>;
    visibility?: string;
    isDraft?: boolean;
    scheduledAt?: Date | null;
    replyRestriction?: string;
    parentId?: string | null;
  }
) {
  if (!data.thoughts || data.thoughts.length === 0) {
    throw new Error("EMPTY_THREAD");
  }

  // 1. Transaction Prisma atomique
  return await prisma.$transaction(async (tx) => {
    let lastPostId = data.parentId || null;
    const list: any[] = [];

    for (let i = 0; i < data.thoughts.length; i++) {
      const node = data.thoughts[i];

      // Vérification des restrictions de réponse (Threadgates)
      if (lastPostId && lastPostId === data.parentId) {
        const replyCheck = await canUserReplyToThought(lastPostId, authorId);
        if (!replyCheck.canReply) {
          throw new Error(replyCheck.reason || "THREADGATE_RESTRICTED");
        }
      }

      // Calcul dynamique du rootId pour la cascade de fils
      let computedRootId: string | null = null;
      if (lastPostId) {
        const parentPost = await tx.thought.findUnique({
          where: { id: lastPostId },
          select: { id: true, rootId: true },
        });
        if (parentPost) {
          computedRootId = parentPost.rootId || parentPost.id;
        }
      }

      // Création de l'enregistrement de la pensée
      const newPost = await tx.thought.create({
        data: {
          content: node.content,
          authorId,
          tags: node.tags ?? [],
          imageUrl: node.imageUrl || null,
          attachments:
            node.attachments && node.attachments.length > 0
              ? {
                  create: node.attachments.map((att, idx) => ({
                    url: att.url,
                    type: att.type || "IMAGE",
                    altText: att.altText || null,
                    order: att.order ?? idx,
                  })),
                }
              : undefined,
          visibility: data.visibility ?? POST_VISIBILITY.PUBLIC,
          isDraft: data.isDraft ?? false,
          scheduledAt: i === 0 ? data.scheduledAt || null : null, // Seul le post racine est planifié
          triggerWarning: node.triggerWarning || null,
          parentId: lastPostId,
          rootId: computedRootId,
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

      // Gestion du sondage
      let createdPoll: any = null;
      if (node.poll && Array.isArray(node.poll.options)) {
        const validOpts = node.poll.options.map((o) => o.trim()).filter(Boolean);
        if (validOpts.length >= 2 && validOpts.length <= 4) {
          const durationHours = node.poll.durationHours || 24;
          const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
          createdPoll = await tx.poll.create({
            data: {
              thoughtId: newPost.id,
              expiresAt,
              options: {
                create: validOpts.map((text, index) => ({
                  text,
                  order: index,
                })),
              },
            },
            include: {
              options: { orderBy: { order: "asc" } },
            },
          });
        }
      }

      lastPostId = newPost.id;
      list.push({ ...newPost, poll: createdPoll });

      // Enregistrer les hashtags
      if (node.tags && node.tags.length > 0) {
        recordHashtags(node.tags).catch((err) =>
          console.error("Error recording hashtags in thread:", err)
        );
      }
    }

    return list;
  });
}

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
  const replyCheck = await canUserReplyToThought(postId, authorId);
  if (!replyCheck.canReply) {
    throw new Error(replyCheck.reason || "THREADGATE_RESTRICTED");
  }

  const targetPost = await prisma.thought.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, rootId: true },
  });

  const computedRootId = targetPost ? (targetPost.rootId || targetPost.id) : null;

  const [reply] = await prisma.$transaction([
    prisma.thought.create({
      data: {
        content,
        authorId,
        parentId: postId,
        rootId: computedRootId,
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


  // 🔔 Dispatch notifications to all thread participants (parent author + root author + mentions)
  const recipientsToNotify = new Set<string>();
  if (targetPost?.authorId && targetPost.authorId !== authorId) {
    recipientsToNotify.add(targetPost.authorId);
  }

  if (computedRootId) {
    const rootPost = await prisma.thought.findUnique({
      where: { id: computedRootId },
      select: { authorId: true },
    });
    if (rootPost?.authorId && rootPost.authorId !== authorId) {
      recipientsToNotify.add(rootPost.authorId);
    }
  }

  // Parse mentions (@username)
  const mentions = content.match(/@([a-zA-Z0-9_]+)/g);
  if (mentions && mentions.length > 0) {
    const usernames = Array.from(new Set(mentions.map((m) => m.slice(1))));
    try {
      const mentionedUsers = await prisma.user.findMany({
        where: { username: { in: usernames } },
        select: { id: true },
      });
      for (const u of mentionedUsers) {
        if (u.id !== authorId) {
          recipientsToNotify.add(u.id);
        }
      }
    } catch (err) {
      console.error("Error finding mentioned users:", err);
    }
  }

  for (const recipientId of recipientsToNotify) {
    createNotification({
      recipientId,
      senderId: authorId,
      type: "REPLY",
      thoughtId: reply.id,
    }).catch((err) => console.error("Error creating participant reply notification:", err));
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

  const likesInclude = currentUserId ? { where: { userId: currentUserId }, select: { userId: true } } : false;
  const repostsInclude = currentUserId
    ? { where: { authorId: currentUserId, deletedAt: null }, select: { id: true, authorId: true } }
    : false;
  const countSelect = { select: { likes: true, replies: true, reposts: true } };

  const pollIncludeQuery = {
    include: {
      options: {
        orderBy: { order: "asc" as const },
        include: { _count: { select: { votes: true } } },
      },
      votes: { select: { optionId: true, userId: true } },
    },
  };

  const thread = await prisma.thought.findUnique({
    where: { id: postId },
    include: {
      author: authorSelect,
      likes: likesInclude,
      reposts: repostsInclude,
      poll: pollIncludeQuery,
      _count: countSelect,
      parent: {
        include: {
          author: authorSelect,
          likes: likesInclude,
          reposts: repostsInclude,
          poll: pollIncludeQuery,
          _count: countSelect,
          parent: {
            include: {
              author: authorSelect,
              likes: likesInclude,
              reposts: repostsInclude,
              poll: pollIncludeQuery,
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
          poll: pollIncludeQuery,
          _count: countSelect,
        },
      },
      replies: {
        include: {
          author: authorSelect,
          parent: { include: { author: authorSelect } },
          likes: likesInclude,
          reposts: repostsInclude,
          poll: pollIncludeQuery,
          _count: countSelect,
          replies: {
            include: {
              author: authorSelect,
              parent: { include: { author: authorSelect } },
              likes: likesInclude,
              reposts: repostsInclude,
              poll: pollIncludeQuery,
              _count: countSelect,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });

  // 🔍 Helper de résolution récursive de la chaîne complète des parents
  const fetchParentAncestors = async (node: any): Promise<any> => {
    if (!node || !node.parentId) return node;

    if (!node.parent) {
      const parentNode = await prisma.thought.findUnique({
        where: { id: node.parentId },
        include: {
          author: authorSelect,
          likes: likesInclude,
          reposts: repostsInclude,
          poll: pollIncludeQuery,
          _count: countSelect,
        },
      });

      if (parentNode) {
        node.parent = await fetchParentAncestors(parentNode);
      }
    } else {
      node.parent = await fetchParentAncestors(node.parent);
    }

    return node;
  };

  if (!thread) return null;

  if (thread.parent) {
    thread.parent = await fetchParentAncestors(thread.parent);
  }

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
    node.poll = formatPollData(node.poll, currentUserId);

    if (node.parent) {
      node.parent = processPostNode(node.parent);
    }
    if (node.replies && Array.isArray(node.replies)) {
      node.replies = node.replies.map(processPostNode);
    }

    return node;
  };

  const processed = processPostNode(thread);
  if (processed) {
    let isFollowingAuthor = false;
    let knownLikers: any[] = [];
    let knownLikersTotal = 0;

    if (currentUserId) {
      if (processed.authorId) {
        const followCheck = await prisma.follows.findFirst({
          where: {
            readerId: currentUserId,
            creatorId: processed.authorId,
          },
        });
        isFollowingAuthor = !!followCheck;
      }

      const follows = await prisma.follows.findMany({
        where: { readerId: currentUserId },
        select: { creatorId: true },
      });
      const creatorIds = follows.map((f: any) => f.creatorId);

      if (creatorIds.length > 0) {
        const canonicalId = processed.repostId || processed.id;
        const likersRaw = await prisma.like.findMany({
          where: {
            postId: canonicalId,
            userId: { in: creatorIds },
          },
          take: 5,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                subdomain: true,
                logoUrl: true,
              },
            },
          },
        });

        knownLikers = likersRaw.map((l: any) => l.user).filter(Boolean);
        knownLikersTotal = await prisma.like.count({
          where: {
            postId: canonicalId,
            userId: { in: creatorIds },
          },
        });
      }
    }

    processed.isFollowingAuthor = isFollowingAuthor;
    processed.knownLikers = knownLikers;
    processed.knownLikersTotal = knownLikersTotal;
  }

  return processed;
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
