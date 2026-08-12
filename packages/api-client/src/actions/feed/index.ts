"use server";

import { follows, bookmarks, posts, articles, users, moderation, threadgates } from "@qoe/db";
import { prisma } from "@qoe/db/client";
import { sliceContentAtPaywall } from "@qoe/utils";
import { ContentVisibility } from "@qoe/db/types";

import { createThoughtSchema, replyToPostSchema, createReportSchema } from "@qoe/config";
import { createClient } from "@qoe/supabase/server";

import { safeAction } from "../utils/safe-action";
import { routes } from "@qoe/config/routes";

const unfurlCache = new Map<string, any>();

export const toggleFollowCreatorHomeAction = safeAction<string, { followed: boolean }>(
  async (creatorId, user) => {
    return follows.toggleFollow(user.id, creatorId);
  }
);

export const toggleBookmarkArticleHomeAction = safeAction<string, { bookmarked: boolean }>(
  async (articleId, user) => {
    return bookmarks.toggleBookmark(user.id, articleId);
  }
);

export const createThoughtAction = safeAction<
  {
    content: string;
    tags: string[];
    imageUrl?: string | null;
    visibility?: string;
    isDraft?: boolean;
    scheduledAt?: string | null;
    triggerWarning?: string | null;
    repostId?: string | null;
    parentId?: string | null;
    replyRestriction?: string | null;
    attachments?: Array<{ url: string; type?: string; altText?: string; order?: number }>;
    poll?: { options: string[]; durationHours?: number } | null;
  },
  { post: any }
>(async (rawInput, user) => {
  const input = createThoughtSchema.parse(rawInput);
  const cleanContent = input.content;

  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = cleanContent.match(urlRegex) || [];
  let charLength = cleanContent.length;
  for (const url of urls) {
    charLength -= url.length;
    const isInternal = url.includes("/post/") || url.includes("/article/") || url.includes("/thought/");
    if (!isInternal) {
      charLength += 20;
    }
  }

  if (charLength > 500) {
    throw new Error("INVALID_CONTENT_LENGTH");
  }

  const newPost = await posts.createThought({
    content: cleanContent,
    authorId: user.id,
    tags: input.tags,
    imageUrl: input.imageUrl || null,
    attachments: rawInput.attachments || [],
    visibility: input.visibility,
    isDraft: input.isDraft,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    triggerWarning: input.triggerWarning || null,
    repostId: input.repostId || null,
    parentId: input.parentId || null,
    replyRestriction: rawInput.replyRestriction || "everyone",
  });

  let createdPoll: any = null;
  if (rawInput.poll && Array.isArray(rawInput.poll.options)) {
    const validOpts = rawInput.poll.options.map((o) => o.trim()).filter(Boolean);
    if (validOpts.length >= 2) {
      const { polls } = await import("@qoe/db");
      createdPoll = await polls.createPollForThought({
        thoughtId: newPost.id,
        options: validOpts,
        durationHours: rawInput.poll.durationHours || 24,
      });
    }
  }



  return { post: { ...newPost, poll: createdPoll } };
});


export const toggleLikePostAction = safeAction<string, { liked: boolean }>(
  async (postId, user) => {
    const res = await posts.toggleLike(postId, user.id);
    return res;
  }
);

export const replyToPostAction = safeAction<
  { postId: string; content: string },
  { reply: any }
>(async (rawInput, user) => {
  const { postId, content } = replyToPostSchema.parse(rawInput);
  const reply = await posts.replyToPost(postId, user.id, content);

  return { reply };
});

export const getPostThreadAction = safeAction<string, { post: any }>(
  async (postId) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const post = await posts.findThreadById(postId, user?.id);
    return { post };
  },
  { requireAuth: false }
);

export const getArticleThreadAction = safeAction<string, { article: any }>(
  async (slug, user) => {
    const article = await articles.findFirstBySlug(slug);
    if (!article) return { article: null };

    let isPaidSubscriber = false;
    let isMember = false;

    if (user) {
      if (user.id === article.authorId) {
        isPaidSubscriber = true;
        isMember = true;
      } else {
        const [sub, subscriberRecord] = await Promise.all([
          (prisma as any).subscription?.findFirst
            ? (prisma as any).subscription.findFirst({
                where: {
                  userId: user.id,
                  creatorId: article.authorId,
                  status: "active",
                },
              })
            : null,
          prisma.subscriber.findFirst({
            where: {
              creatorId: article.authorId,
              email: user.email || "",
              isActive: true,
            },
          }),
        ]);
        isPaidSubscriber = !!sub;
        isMember = isPaidSubscriber || !!subscriberRecord;
      }
    }

    const visibility = article.isPremium
      ? ContentVisibility.PAID_SUBSCRIBERS
      : ContentVisibility.PUBLIC;

    const paywallCutResult = sliceContentAtPaywall(
      article.content || "",
      { isMember, isPaidSubscriber },
      visibility
    );

    return {
      article: {
        ...article,
        content: paywallCutResult.content,
        isTruncated: paywallCutResult.isTruncated,
        accessGranted: paywallCutResult.accessGranted,
        paywallMeta: paywallCutResult.paywallMeta,
      },
    };
  },
  { requireAuth: false }
);

export const reportTargetAction = safeAction<any, { success: boolean }>(
  async (rawInput, user) => {
    const { targetId, targetType, reason, details } = createReportSchema.parse(rawInput);
    await moderation.createReport({
      reporterId: user.id,
      targetId,
      targetType: targetType as "thought" | "article" | "user" | "comment",
      reason,
      details: details || null,
    });
    return { success: true };
  }
);


export const toggleRepostPostAction = safeAction<
  string,
  { reposted: boolean; canonicalId: string; post?: any }
>(async (postId, user) => {
  const result = await posts.toggleRepost(postId, user.id);
  return result;
});

export const repostPostAction = safeAction<string, { repost: any }>(
  async (postId, user) => {
    const res = await posts.toggleRepost(postId, user.id);

    return { repost: res.post };
  }
);

export const deletePostAction = safeAction<string, { success: boolean }>(
  async (postId, user) => {
    const deleted = await posts.deletePost(postId, user.id);
    if (!deleted) throw new Error("UNAUTHORIZED");
    return { success: true };
  }
);

export const getProfileDataAction = safeAction<string, any>(
  async (username) => {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const currentUserId = authUser?.id || null;

    const { prisma } = await import("@qoe/db/client");
    const profileUser = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        logoUrl: true,
        heroText: true,
        onboardingText: true,
        isCertified: true,
        createdAt: true,
        subdomain: true,
        headerImageUrl: true,
      },
    });

    if (!profileUser) throw new Error("NOT_FOUND");

    let isFollowingUser = false;
    if (currentUserId && currentUserId !== profileUser.id) {
      isFollowingUser = await follows.isFollowing(currentUserId, profileUser.id);
    }

    const followersCount = await follows.countFollowers(profileUser.id);
    const followingCount = await follows.countFollowing(profileUser.id);
    const isOwnProfile = currentUserId === profileUser.id;

    const postsCount = await prisma.thought.count({
      where: {
        authorId: profileUser.id,
        ...(isOwnProfile
          ? {}
          : {
              isDraft: false,
              OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
              visibility: isFollowingUser ? { in: ["public", "followers"] } : "public",
            }),
      },
    });

    const dbPosts = await prisma.thought.findMany({
      where: {
        authorId: profileUser.id,
        ...(isOwnProfile
          ? {}
          : {
              isDraft: false,
              OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
              visibility: isFollowingUser ? { in: ["public", "followers"] } : "public",
            }),
      },
      include: {
        author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true } },
        parent: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true } },
          },
        },
        repost: {
          include: {
            author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true } },
          },
        },
        likes: { select: { userId: true } },
        reposts: currentUserId
          ? { where: { authorId: currentUserId, deletedAt: null }, select: { id: true, authorId: true, content: true } }
          : false,
        _count: { select: { likes: true, replies: true, reposts: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const dbArticles =
      profileUser.role === "creator" || profileUser.role === "superadmin"
        ? await articles.findPublishedByAuthor(profileUser.id, { take: 50 })
        : [];

    const dbHighlights = await prisma.highlight.findMany({
      where: { readerId: profileUser.id },
      include: { article: { select: { title: true, slug: true, author: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    const dbLetters = await prisma.letter.findMany({
      where: { recipientId: profileUser.id, isPublic: true },
      include: { sender: { select: { name: true, username: true, logoUrl: true, isCertified: true } } },
      orderBy: { createdAt: "desc" },
    });

    let dbMutedWords: Array<{ id: string; word: string }> = [];
    if (currentUserId && currentUserId === profileUser.id) {
      dbMutedWords = await prisma.mutedWord.findMany({
        where: { userId: currentUserId },
        select: { id: true, word: true },
        orderBy: { createdAt: "desc" },
      });
    }

    return {
      profileUser: { ...profileUser, createdAt: profileUser.createdAt.toISOString() },
      isFollowing: isFollowingUser,
      followersCount,
      followingCount,
      postsCount,
      posts: dbPosts.map((p: any) => {
        const canonicalPost = p.repost || p;
        const likesCount = canonicalPost._count?.likes ?? p._count?.likes ?? 0;
        const repliesCount = canonicalPost._count?.replies ?? p._count?.replies ?? 0;
        const repostsCount = canonicalPost._count?.reposts ?? p._count?.reposts ?? 0;

        const liked =
          (canonicalPost.likes && Array.isArray(canonicalPost.likes) && canonicalPost.likes.some((l: any) => l.userId === currentUserId)) ||
          (p.likes && Array.isArray(p.likes) && p.likes.some((l: any) => l.userId === currentUserId)) ||
          false;

        const reposted =
          (canonicalPost.reposts &&
            Array.isArray(canonicalPost.reposts) &&
            canonicalPost.reposts.some((r: any) => r.authorId === currentUserId && (!r.content || !r.content.trim()))) ||
          (p.reposts &&
            Array.isArray(p.reposts) &&
            p.reposts.some((r: any) => r.authorId === currentUserId && (!r.content || !r.content.trim()))) ||
          false;

        return {
          ...p,
          createdAt: p.createdAt.toISOString(),
          parent: p.parent
            ? {
                ...p.parent,
                createdAt: p.parent.createdAt ? p.parent.createdAt.toISOString() : undefined,
                author: {
                  ...p.parent.author,
                  isCertified: p.parent.author.isCertified || false,
                },
              }
            : null,
          repost: p.repost
            ? {
                ...p.repost,
                createdAt: p.repost.createdAt ? p.repost.createdAt.toISOString() : p.createdAt.toISOString(),
                author: {
                  ...p.repost.author,
                  isCertified: p.repost.author.isCertified || false,
                },
              }
            : null,
          likesCount,
          repliesCount,
          repostsCount,
          liked,
          reposted,
        };
      }),
      articles: dbArticles.map((a: any) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: (a as any).updatedAt ? (a as any).updatedAt.toISOString() : new Date().toISOString(),
      })),
      highlights: dbHighlights.map((h: any) => ({ ...h, createdAt: h.createdAt.toISOString() })),
      letters: dbLetters.map((l: any) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      initialMutedWords: dbMutedWords,
    };

  },
  { requireAuth: false }
);

export const getUserDraftsAction = safeAction<void, { drafts: any[] }>(async (_, user) => {
  const drafts = await posts.getUserDrafts(user.id);
  return { drafts };
});

export const pinPostAction = safeAction<string, { success: boolean }>(async (postId, user) => {
  const success = await posts.setPinStatus(postId, user.id, true);
  if (!success) throw new Error("UNAUTHORIZED");


  return { success: true };
});

export const unpinPostAction = safeAction<string, { success: boolean }>(async (postId, user) => {
  const success = await posts.setPinStatus(postId, user.id, false);
  if (!success) throw new Error("UNAUTHORIZED");


  return { success: true };
});

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "169.254.169.254" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, p1, p2] = ipMatch.map(Number);
    if (p1 === 10) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 100 && p2 >= 64 && p2 <= 127) return true;
    if (p1 === 127) return true;
    if (p1 === 169 && p2 === 254) return true;
  }
  return false;
}

export const unfurlUrlAction = safeAction<string, any>(
  async (urlStr) => {
    try {
      let url = urlStr.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }

      if (unfurlCache.size > 500) {
        const firstKey = unfurlCache.keys().next().value;
        if (firstKey) unfurlCache.delete(firstKey);
      }

      if (unfurlCache.has(url)) {
        return unfurlCache.get(url)!;
      }

      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("INVALID_PROTOCOL");
      }

      const isInternalHost =
        parsedUrl.hostname.endsWith("qoe.fi") ||
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname.endsWith(".localhost") ||
        parsedUrl.hostname === "127.0.0.1";

      if (isInternalHost) {
        const postMatch = parsedUrl.pathname.match(/\/post\/([a-zA-Z0-9]+)/);
        if (postMatch) {
          const postId = postMatch[1];
          const post = await posts.findThreadById(postId);
          if (post) {
            const result = { isInternal: true, postType: "post" as const, data: post };
            unfurlCache.set(url, result);
            return result;
          }
        }

        const articleMatch = parsedUrl.pathname.match(/\/article\/([a-zA-Z0-9_-]+)/);
        if (articleMatch) {
          const slug = articleMatch[1];
          const article = await articles.findFirstBySlug(slug);
          if (article) {
            const result = { isInternal: true, postType: "article" as const, data: article };
            unfurlCache.set(url, result);
            return result;
          }
        }
      }

      if (isPrivateHost(parsedUrl.hostname)) {
        const blockedResult = {
          isInternal: false,
          externalMetadata: { title: parsedUrl.hostname, description: null, image: null, siteName: parsedUrl.hostname, url },
        };
        unfurlCache.set(url, blockedResult);
        return blockedResult;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const failResult = {
          isInternal: false,
          externalMetadata: { title: parsedUrl.hostname, description: null, image: null, siteName: parsedUrl.hostname, url },
        };
        unfurlCache.set(url, failResult);
        return failResult;
      }

      const html = await response.text();

      const getMeta = (propertyOrName: string) => {
        const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${propertyOrName}["'][^>]*content=["']([^"']+)["']`, "i");
        let match = html.match(regex);
        if (!match) {
          const regexReversed = new RegExp(`<meta[^]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propertyOrName}["']`, "i");
          match = html.match(regexReversed);
        }
        return match ? match[1] : null;
      };

      const getTitle = () => {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1] : null;
      };

      const title = getMeta("og:title") || getMeta("twitter:title") || getTitle() || parsedUrl.hostname;
      const description = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
      let image = getMeta("og:image") || getMeta("twitter:image");

      if (image && image.startsWith("/")) {
        try {
          image = new URL(image, parsedUrl.origin).href;
        } catch {
          // ignore
        }
      }

      const siteName = getMeta("og:site_name") || parsedUrl.hostname;

      const successResult = {
        isInternal: false,
        externalMetadata: {
          title: title ? title.trim() : parsedUrl.hostname,
          description: description ? description.trim() : null,
          image: image ? image.trim() : null,
          siteName: siteName ? siteName.trim() : parsedUrl.hostname,
          url,
        },
      };
      unfurlCache.set(url, successResult);
      return successResult;
    } catch (error) {
      console.error("Unfurl error:", error);
      try {
        const fallbackUrl = new URL(urlStr);
        const errFallbackResult = {
          isInternal: false,
          externalMetadata: {
            title: fallbackUrl.hostname,
            description: null,
            image: null,
            siteName: fallbackUrl.hostname,
            url: urlStr,
          },
        };
        unfurlCache.set(urlStr, errFallbackResult);
        return errFallbackResult;
      } catch {
        const totalFallbackResult = {
          isInternal: false,
          externalMetadata: {
            title: urlStr,
            description: null,
            image: null,
            siteName: urlStr,
            url: urlStr,
          },
        };
        unfurlCache.set(urlStr, totalFallbackResult);
        return totalFallbackResult;
      }
    }
  },
  { requireAuth: false }
);

export const updateProfileAction = safeAction<
  {
    name?: string;
    heroText?: string;
    onboardingText?: string;
    logoUrl?: string;
    headerImageUrl?: string;
  },
  { user: any }
>(async (input, user) => {
  const { prisma } = await import("@qoe/db/client");
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.heroText !== undefined ? { heroText: input.heroText } : {}),
      ...(input.onboardingText !== undefined ? { onboardingText: input.onboardingText } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.headerImageUrl !== undefined ? { headerImageUrl: input.headerImageUrl } : {}),
    },
  });


  return { user: updatedUser };
});

export const searchUsersAction = safeAction<string, { users: any[] }>(
  async (query) => {
    const list = await users.searchUsers(query);
    return { users: list };
  },
  { requireAuth: false }
);

export const toggleHideReplyAction = safeAction<string, { isHiddenByAuthor: boolean }>(
  async (replyId, user) => {
    const updated = await threadgates.toggleHideReplyByAuthor(replyId, user.id);
    return { isHiddenByAuthor: updated.isHiddenByAuthor };
  }
);

export const canUserReplyAction = safeAction<string, { canReply: boolean; reason?: string; restriction: string }>(
  async (thoughtId, user) => {
    const res = await threadgates.canUserReplyToThought(thoughtId, user.id);
    return { canReply: res.canReply, reason: res.reason, restriction: res.restriction };
  },
  { requireAuth: false }
);

export const toggleBlockUserAction = safeAction<string, { blocked: boolean }>(
  async (targetUserId, user) => {
    const res = await moderation.toggleBlockUser(user.id, targetUserId);
    return res;
  }
);

export const toggleMuteWordAction = safeAction<string, { muted: boolean; word: string }>(
  async (word, user) => {
    const res = await moderation.toggleMuteWord(user.id, word);
    return res;
  }
);

export const getFeedItemsAction = safeAction<
  {
    feedType?: string;
    cursor?: string | null;
    limit?: number;
    username?: string;
  },
  { items: any[]; nextCursor: string | null; hasMore: boolean }
>(
  async ({ feedType = "recommandation", cursor = null, limit = 20, username }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const fetchLimit = Math.min(limit, 50);

    let rawPosts: any[] = [];
    if (feedType === "following" && user) {
      rawPosts = await posts.findFollowingFeed(user.id, {
        take: fetchLimit,
        cursor: cursor || undefined,
      });
    } else {
      rawPosts = await posts.findTrending(fetchLimit + 1, user?.id);
    }

    const hasMore = rawPosts.length > fetchLimit;
    const itemsList = hasMore ? rawPosts.slice(0, fetchLimit) : rawPosts;
    const nextCursor = hasMore && itemsList.length > 0 ? itemsList[itemsList.length - 1].id : null;

    return {
      items: itemsList,
      nextCursor,
      hasMore,
    };
  },
  { requireAuth: false }
);

