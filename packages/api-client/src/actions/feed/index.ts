'use server';

// =====================================================================
// 🍞 actions/feed — Server Actions du feed & des pensées (web uniquement)
// =====================================================================
// Le plus gros module d'actions : lecture/écriture du feed, pensées
// (threads, likes, reposts, bookmarks, rapports), profils publics, drafts,
// épinglage, unfurl de liens, réglages de modération.
//
// 🔗 GO-ONLY : l'API Go est la source de vérité (QOE_API_GO_URL défini),
//    plusieurs actions délèguent la logique au backend Go (apps/api-go)
//    via `goFetch()` — le contrat TS (ActionResult<T>) reste identique,
//    seules l'implémentation et l'authentification changent (JWT en header).
//    Sans Go, elles retombent sur les dépôts Prisma de `@qoe/db`.
//
// ⚠️ Fichier serveur : NON exposé au mobile via @qoe/api-client/mobile.
//    Le mobile appelle directement l'API Go (QoeApiClient.getFeed,
//    toggleLike, toggleRepost, toggleBookmark…). Les contrats de données
//    correspondent à ceux de `@qoe/api-client/types`.
// =====================================================================

import { follows, bookmarks, posts, articles, users, moderation, threadgates } from '@qoe/db';
import type { FeedSlice } from '@qoe/db/repositories/posts';
import { prisma, type User } from '@qoe/db/client';
import { sliceContentAtPaywall, type PaywallCutResult } from '@qoe/utils';
import { ContentVisibility } from '@qoe/db/types';

import { replyToPostSchema, createReportSchema, type CreateReportInput } from '@qoe/config';
import { goFetch } from '../utils/go-client';

import { safeAction } from '../utils/safe-action';
import type {
  FeedSlice as ApiFeedSlice,
  FeedPost as ApiFeedPost,
  FeedArticle as ApiFeedArticle,
  FeedResult as ApiFeedResult,
  ArticleFeedResult as ApiArticleFeedResult,
  PublicProfileData,
  FollowActor as ApiFollowActor,
} from '../../types';

type ThoughtThreadPost = Awaited<ReturnType<typeof posts.createThoughtThread>>[number];
type Reply = Awaited<ReturnType<typeof posts.replyToPost>>;
type ThreadPost = Awaited<ReturnType<typeof posts.findThreadById>>;
type RepostResult = Awaited<ReturnType<typeof posts.toggleRepost>>;
type Draft = Awaited<ReturnType<typeof posts.getUserDrafts>>[number];
type ArticleRecord = Awaited<ReturnType<typeof articles.findFirstBySlug>>;
type SearchedUser = Awaited<ReturnType<typeof users.searchUsers>>[number];

interface UnfurlExternalMetadata {
  title: string;
  description: string | null;
  image: string | null;
  siteName: string;
  url: string;
}

type UnfurlResult =
  | { isInternal: true; postType: 'post'; data: ThreadPost }
  | { isInternal: true; postType: 'article'; data: ArticleRecord }
  | { isInternal: false; externalMetadata: UnfurlExternalMetadata };

// Cache mémoire simple pour l'unfurl (évite de re-télécharger la même URL).
const unfurlCache = new Map<string, UnfurlResult>();

// ─────────────────────────────────────────────────────────────────────
// Actions d'écriture (Go-only — l'API Go est la source de vérité)
// ─────────────────────────────────────────────────────────────────────
export const toggleFollowCreatorHomeAction = safeAction<string, { followed: boolean }>(
  async (publicationId) => {
    const res = await goFetch<{ data: { following: boolean } }>(
      `/v1/users/${encodeURIComponent(publicationId)}/follow`,
      { method: 'POST' }
    );
    return { followed: res.data.following };
  }
);

// ─── Liste abonnés / abonnements (profil) ────────────────────────────

/**
 * 📄 Liste paginée des abonnés / abonnements d'un profil (web).
 * Résout la publication par handle puis liste via le repo Prisma.
 */
export const getFollowListAction = safeAction<
  { handle: string; tab: 'followers' | 'following'; cursor?: number; limit?: number },
  { items: follows.FollowActorDTO[]; nextCursor: string | null; hasMore: boolean }
>(
  async ({ handle, tab, cursor = 0, limit = 30 }) => {
    const clean = decodeURIComponent(handle).replace(/^@/, '');
    const path = tab === 'followers' ? 'followers' : 'following';
    const page = await goFetch<{ items: ApiFollowActor[]; nextCursor: string; hasMore: boolean }>(
      `/v1/users/${encodeURIComponent(clean)}/${path}?limit=${limit}&cursor=${cursor}`
    );
    const items: follows.FollowActorDTO[] = (page.items ?? []).map((a) => ({
      id: a.id,
      publicationId: a.publicationId,
      name: a.name,
      username: a.username,
      subdomain: null,
      logoUrl: a.logoUrl,
      isCertified: a.isCertified,
      followedAt: a.followedAt,
      viewerFollows: a.viewerFollows,
    }));
    return {
      items,
      nextCursor: page.nextCursor ?? null,
      hasMore: page.hasMore,
    };
  },
  { requireAuth: false }
);

export const toggleBookmarkArticleHomeAction = safeAction<string, { bookmarked: boolean }>(
  async (articleId, user) => {
    return bookmarks.toggleBookmark(user.id, articleId);
  }
);

export const createThoughtThreadAction = safeAction<
  {
    thoughts: Array<{
      content: string;
      tags: string[];
      imageUrl?: string | null;
      attachments?: Array<{ url: string; type?: string; altText?: string; order?: number }>;
      quotedArticleId?: string | null;
      quotedExcerpt?: string | null;
      triggerWarning?: string | null;
      poll?: { options: string[]; durationHours?: number } | null;
    }>;
    visibility?: string;
    isDraft?: boolean;
    scheduledAt?: string | null;
    replyRestriction?: string | null;
    parentId?: string | null;
  },
  { posts: ThoughtThreadPost[] }
>(async (rawInput, user) => {
  const { thoughts, visibility, isDraft, scheduledAt, replyRestriction, parentId } = rawInput;

  if (!thoughts || !Array.isArray(thoughts) || thoughts.length === 0) {
    throw new Error('EMPTY_THREAD');
  }

  // 1. Validation de la longueur pour chaque pensée (500 caractères, hors URLs)
  for (let i = 0; i < thoughts.length; i++) {
    const node = thoughts[i];
    const cleanContent = node.content || '';

    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = cleanContent.match(urlRegex) || [];
    let charLength = cleanContent.length;
    for (const url of urls) {
      charLength -= url.length;
      const isInternal =
        url.includes('/post/') || url.includes('/article/') || url.includes('/thought/');
      if (!isInternal) {
        charLength += 20;
      }
    }

    if (charLength > 500) {
      throw new Error(`INVALID_CONTENT_LENGTH_NODE_${i}`);
    }
  }

  // 2. Création du fil via la méthode transactionnelle atomique du dépôt
  const createdPosts = await posts.createThoughtThread(user.id, {
    thoughts: thoughts.map((t) => ({
      content: t.content,
      tags: t.tags ?? [],
      imageUrl: t.imageUrl || null,
      attachments: t.attachments ?? [],
      quotedArticleId: t.quotedArticleId || null,
      quotedExcerpt: t.quotedExcerpt || null,
      triggerWarning: t.triggerWarning || null,
      poll: t.poll ?? null,
    })),
    visibility: visibility ?? 'public',
    isDraft: isDraft ?? false,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    replyRestriction: replyRestriction ?? 'everyone',
    parentId: parentId || null,
  });

  return { posts: createdPosts };
});

export const toggleLikePostAction = safeAction<string, { liked: boolean }>(async (postId) => {
  // ✅ Go-only : logique (DB + notification LIKE) déléguée au backend Go.
  return goFetch<{ liked: boolean }>(`/v1/posts/${postId}/like`, {
    method: 'POST',
  });
});

// ─────────────────────────────────────────────────────────────────────
// Helpers de normalisation et reconstruction d'arbre de discussion (Web)
// ─────────────────────────────────────────────────────────────────────

type RawPostPayload = Record<string, unknown>;

function mapFeedPostToThreadThought(
  p: RawPostPayload | null | undefined
): Record<string, unknown> | null {
  if (!p) return null;
  const author = (p.author || {}) as Record<string, unknown>;
  const counts = (p._count || {}) as Record<string, unknown>;
  const likesCount =
    typeof p.likesCount === 'number'
      ? p.likesCount
      : typeof p.likeCount === 'number'
        ? p.likeCount
        : typeof counts.likes === 'number'
          ? counts.likes
          : 0;
  const repliesCount =
    typeof p.repliesCount === 'number'
      ? p.repliesCount
      : typeof p.replyCount === 'number'
        ? p.replyCount
        : typeof counts.replies === 'number'
          ? counts.replies
          : 0;
  const repostsCount =
    typeof p.repostsCount === 'number'
      ? p.repostsCount
      : typeof p.repostCount === 'number'
        ? p.repostCount
        : typeof counts.reposts === 'number'
          ? counts.reposts
          : 0;

  return {
    id: p.id as string,
    content: (p.content as string) ?? '',
    imageUrl: (p.imageUrl as string | null) ?? null,
    createdAt: p.createdAt as string,
    triggerWarning: (p.triggerWarning as string | null) ?? null,
    isPinned: Boolean(p.isPinned),
    isDeleted: Boolean(p.isDeleted),
    isHiddenByAuthor: Boolean(p.isHiddenByAuthor),
    author: {
      id: (author.id as string) ?? (p.authorId as string) ?? '',
      name: (author.name as string | null) ?? null,
      username: (author.username as string | null) ?? null,
      subdomain: (author.subdomain as string | null) ?? null,
      logoUrl: (author.logoUrl as string | null) ?? null,
      isCertified: Boolean(author.isCertified),
    },
    parentId: (p.parentId as string | null) ?? null,
    rootId: (p.rootId as string | null) ?? null,
    repostId: (p.repostId as string | null) ?? null,
    parent: p.parent ? mapFeedPostToThreadThought(p.parent as RawPostPayload) : null,
    repost: p.repost ? mapFeedPostToThreadThought(p.repost as RawPostPayload) : null,
    likesCount,
    repliesCount,
    repostsCount,
    liked: Boolean(p.liked),
    reposted: Boolean(p.reposted),
    likes: (p.likes as unknown[]) ?? (p.liked ? [{ userId: (author.id as string) || '' }] : []),
    _count: {
      likes: likesCount,
      replies: repliesCount,
      reposts: repostsCount,
    },
    attachments: (p.attachments as unknown[]) ?? [],
    poll: p.poll ?? null,
    tags: (p.tags as string[]) ?? [],
    replyRestriction: (p.replyRestriction as string) ?? 'everyone',
    replies: [] as Record<string, unknown>[],
  };
}

function buildThreadTree(
  rootPostId: string,
  flatReplies: RawPostPayload[]
): Record<string, unknown>[] {
  const nodesMap = new Map<string, Record<string, unknown>>();
  const directReplies: Record<string, unknown>[] = [];

  for (const r of flatReplies) {
    const node = mapFeedPostToThreadThought(r);
    if (node && typeof node.id === 'string') {
      nodesMap.set(node.id, node);
    }
  }

  for (const r of flatReplies) {
    const node = nodesMap.get(r.id as string);
    if (!node) continue;
    const parentId = r.parentId as string | undefined;
    if (!parentId || parentId === rootPostId) {
      directReplies.push(node);
    } else {
      const parentNode = nodesMap.get(parentId);
      if (parentNode && Array.isArray(parentNode.replies)) {
        parentNode.replies.push(node);
      } else {
        directReplies.push(node);
      }
    }
  }

  return directReplies;
}

function mapGoThreadToWebThread(
  rawThread: RawPostPayload | null | undefined
): Record<string, unknown> | null {
  if (!rawThread) return null;
  const root = mapFeedPostToThreadThought(rawThread);
  if (!root) return null;
  const flatReplies = Array.isArray(rawThread.replies)
    ? (rawThread.replies as RawPostPayload[])
    : [];
  root.replies = buildThreadTree(root.id as string, flatReplies);
  return root;
}

export const replyToPostAction = safeAction<{ postId: string; content: string }, { reply: Reply }>(
  async (rawInput) => {
    const { postId, content } = replyToPostSchema.parse(rawInput);

    // ✅ Go-only : threadgate + notifications MENTION/REPLY + invalidation cache.
    const replyRaw = await goFetch<RawPostPayload>(`/v1/posts/${postId}/reply`, {
      method: 'POST',
      body: { content },
    });
    const reply = mapFeedPostToThreadThought(replyRaw);
    return { reply: reply as unknown as Reply };
  }
);

export const getPostThreadAction = safeAction<string, { post: ThreadPost }>(
  async (postId) => {
    // ✅ Go-only : thread (racine + réponses + chaîne parent/repost).
    const res = await goFetch<{ post: RawPostPayload }>(`/v1/posts/${postId}/thread`);
    const mapped = mapGoThreadToWebThread(res.post);
    return { post: mapped as unknown as ThreadPost };
  },
  { requireAuth: false }
);

export const getArticleThreadAction = safeAction<
  string,
  { article: (ArticleRecord & PaywallCutResult) | null }
>(
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
        const legacySubscription = (
          prisma as unknown as {
            subscription?: {
              findFirst: (args: {
                where: { userId: string; creatorId: string; status: string };
              }) => Promise<{ id: string } | null>;
            };
          }
        ).subscription;

        const [sub, subscriberRecord] = await Promise.all([
          legacySubscription
            ? legacySubscription.findFirst({
                where: {
                  userId: user.id,
                  creatorId: article.authorId,
                  status: 'active',
                },
              })
            : null,
          prisma.subscriber.findFirst({
            where: {
              publicationId: article.publicationId,
              email: user.email || '',
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
      article.content || '',
      { isMember, isPaidSubscriber },
      visibility
    );

    return {
      article: {
        ...article,
        author: {
          id: article.publication?.id ?? article.authorId,
          name: article.publication?.name ?? article.author?.name ?? null,
          username: article.publication?.slug ?? article.author?.username ?? null,
          subdomain: article.publication?.subdomain ?? null,
          customDomain: article.publication?.customDomain ?? null,
          logoUrl: article.publication?.logoUrl ?? article.author?.logoUrl ?? null,
          heroText: article.publication?.heroText ?? null,
          isCertified: article.publication?.isCertified ?? false,
          type: article.publication?.type ?? 'PERSONAL',
          authorName: article.author?.name ?? null,
        },
        content: paywallCutResult.content,
        isTruncated: paywallCutResult.isTruncated,
        accessGranted: paywallCutResult.accessGranted,
        paywallMeta: paywallCutResult.paywallMeta,
      },
    };
  },
  { requireAuth: false }
);

export const reportTargetAction = safeAction<CreateReportInput, { success: boolean }>(
  async (rawInput, user) => {
    const { targetId, targetType, reason, details } = createReportSchema.parse(rawInput);
    await moderation.createReport({
      reporterId: user.id,
      targetId,
      targetType: targetType as 'thought' | 'article' | 'user' | 'comment',
      reason,
      details: details || null,
    });
    return { success: true };
  }
);

export const toggleRepostPostAction = safeAction<
  string,
  { reposted: boolean; canonicalId: string; post?: RepostResult['post'] }
>(async (postId) => {
  // ✅ Go-only : logique + notification REPOST déléguées au backend Go.
  const body = await goFetch<{ reposted: boolean }>(`/v1/posts/${postId}/repost`, {
    method: 'POST',
  });
  return { reposted: body.reposted, canonicalId: postId };
});

export const deletePostAction = safeAction<string, { success: boolean }>(async (postId) => {
  // ✅ Go-only : logique + notifications déléguées au backend Go.
  await goFetch(`/v1/posts/${postId}`, { method: 'DELETE' });
  return { success: true };
});

export const getUserDraftsAction = safeAction<void, { drafts: Draft[] }>(async (_, user) => {
  const drafts = await posts.getUserDrafts(user.id);
  return { drafts };
});

export const pinPostAction = safeAction<string, { success: boolean }>(async (postId, user) => {
  const success = await posts.setPinStatus(postId, user.id, true);
  if (!success) throw new Error('UNAUTHORIZED');

  return { success: true };
});

export const unpinPostAction = safeAction<string, { success: boolean }>(async (postId, user) => {
  const success = await posts.setPinStatus(postId, user.id, false);
  if (!success) throw new Error('UNAUTHORIZED');

  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────
// Unfurl de liens (aperçu de carte pour une URL collée dans le composeur)
// ─────────────────────────────────────────────────────────────────────

// Détecte les hôtes privés/réservés (SSRF guard : on ne fetch jamais
// localhost, les IP privées, .local/.internal…).
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
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

export const unfurlUrlAction = safeAction<string, UnfurlResult>(
  async (urlStr) => {
    try {
      let url = urlStr.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      if (unfurlCache.size > 500) {
        const firstKey = unfurlCache.keys().next().value;
        if (firstKey) unfurlCache.delete(firstKey);
      }

      if (unfurlCache.has(url)) {
        return unfurlCache.get(url)!;
      }

      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('INVALID_PROTOCOL');
      }

      const isInternalHost =
        parsedUrl.hostname.endsWith('qoe.fi') ||
        parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname.endsWith('.localhost') ||
        parsedUrl.hostname === '127.0.0.1';

      if (isInternalHost) {
        const postMatch = parsedUrl.pathname.match(/\/post\/([a-zA-Z0-9]+)/);
        if (postMatch) {
          const postId = postMatch[1];
          const post = await posts.findThreadById(postId);
          if (post) {
            const result: UnfurlResult = { isInternal: true, postType: 'post', data: post };
            unfurlCache.set(url, result);
            return result;
          }
        }

        const articleMatch = parsedUrl.pathname.match(/\/article\/([a-zA-Z0-9_-]+)/);
        if (articleMatch) {
          const slug = articleMatch[1];
          const article = await articles.findFirstBySlug(slug);
          if (article) {
            const result: UnfurlResult = { isInternal: true, postType: 'article', data: article };
            unfurlCache.set(url, result);
            return result;
          }
        }
      }

      if (isPrivateHost(parsedUrl.hostname)) {
        const blockedResult: UnfurlResult = {
          isInternal: false,
          externalMetadata: {
            title: parsedUrl.hostname,
            description: null,
            image: null,
            siteName: parsedUrl.hostname,
            url,
          },
        };
        unfurlCache.set(url, blockedResult);
        return blockedResult;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const failResult: UnfurlResult = {
          isInternal: false,
          externalMetadata: {
            title: parsedUrl.hostname,
            description: null,
            image: null,
            siteName: parsedUrl.hostname,
            url,
          },
        };
        unfurlCache.set(url, failResult);
        return failResult;
      }

      const html = await response.text();

      const getMeta = (propertyOrName: string) => {
        const regex = new RegExp(
          `<meta[^>]*(?:property|name)=["']${propertyOrName}["'][^>]*content=["']([^"']+)["']`,
          'i'
        );
        let match = html.match(regex);
        if (!match) {
          const regexReversed = new RegExp(
            `<meta[^]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propertyOrName}["']`,
            'i'
          );
          match = html.match(regexReversed);
        }
        return match ? match[1] : null;
      };

      const getTitle = () => {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1] : null;
      };

      const title =
        getMeta('og:title') || getMeta('twitter:title') || getTitle() || parsedUrl.hostname;
      const description =
        getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
      let image = getMeta('og:image') || getMeta('twitter:image');

      if (image && image.startsWith('/')) {
        try {
          image = new URL(image, parsedUrl.origin).href;
        } catch {
          // ignore
        }
      }

      const siteName = getMeta('og:site_name') || parsedUrl.hostname;

      const successResult: UnfurlResult = {
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
      console.error('Unfurl error:', error);
      try {
        const fallbackUrl = new URL(urlStr);
        const errFallbackResult: UnfurlResult = {
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
        const totalFallbackResult: UnfurlResult = {
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

// ─────────────────────────────────────────────────────────────────────
// Profil & modération
// ─────────────────────────────────────────────────────────────────────
export const updateProfileAction = safeAction<
  {
    name?: string;
    heroText?: string;
    onboardingText?: string;
    logoUrl?: string;
    headerImageUrl?: string;
  },
  { user: User }
>(async (input, user) => {
  const { prisma } = await import('@qoe/db/client');
  const { publications } = await import('@qoe/db');
  await publications.syncUserPublication(user.id, {
    name: input.name ?? undefined,
    heroText: input.heroText ?? undefined,
    logoUrl: input.logoUrl ?? undefined,
    headerImageUrl: input.headerImageUrl ?? undefined,
  });
  if (input.onboardingText !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { onboardingText: input.onboardingText },
    });
  }
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!updatedUser) throw new Error('USER_NOT_FOUND');

  return { user: updatedUser };
});

export const searchUsersAction = safeAction<string, { users: SearchedUser[] }>(
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

export const canUserReplyAction = safeAction<
  string,
  { canReply: boolean; reason?: string; restriction: string }
>(
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

// ─────────────────────────────────────────────────────────────────────
// Feed paginé (proxy Go quand disponible : /v1/feed ou /v1/feed/trending)
// ─────────────────────────────────────────────────────────────────────
export const getFeedItemsAction = safeAction<
  {
    feedType?: string;
    cursor?: string | null;
    limit?: number;
    username?: string;
  },
  { items: FeedSlice[]; nextCursor: string | null; hasMore: boolean }
>(
  async ({ feedType = 'recommandation', cursor = null, limit = 20, username }) => {
    // ✅ Go-only : le feed (shape FeedSlice + pagination + invalidation cache)
    //    est servi par le backend Go.
    const path = username
      ? `/v1/users/${encodeURIComponent(username)}/posts?limit=${Math.min(limit, 50)}&cursor=${encodeURIComponent(cursor ?? '')}`
      : feedType === 'following'
        ? `/v1/feed?limit=${Math.min(limit, 50)}&cursor=${encodeURIComponent(cursor ?? '')}`
        : `/v1/feed/trending?limit=${Math.min(limit, 50)}&cursor=${encodeURIComponent(cursor ?? '')}`;
    const body = await goFetch<{
      items: unknown[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(path);
    return {
      items: body.items as unknown as FeedSlice[],
      nextCursor: body.nextCursor,
      hasMore: body.hasMore,
    };
  },
  { requireAuth: false }
);

// ─────────────────────────────────────────────────────────────────────
// 👤 Profil public — lecture depuis l'API Go (shape unifié FeedPost)
// ─────────────────────────────────────────────────────────────────────

/** Pensée de profil (contrat web, mappé depuis FeedSlice/FeedPost Go). */
export interface ProfilePostPayload {
  id: string;
  content: string;
  imageUrl: string | null;
  createdAt: string | Date;
  triggerWarning?: string | null;
  isPinned?: boolean;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  };
  parentId?: string | null;
  repostId?: string | null;
  parent?: ProfilePostPayload | null;
  repost?: ProfilePostPayload | null;
  likesCount?: number;
  repliesCount?: number;
  repostsCount?: number;
  liked?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
}

/** Profil résolu (contrat web de la page /[username]). */
export interface ProfileResolvePayload {
  profileUser: {
    id: string;
    ownerUserId?: string | null;
    type: 'PERSONAL' | 'MEDIA';
    name: string | null;
    username: string | null;
    subdomain: string | null;
    customDomain: string | null;
    logoUrl: string | null;
    heroText: string | null;
    headerImageUrl: string | null;
    onboardingText: string | null;
    isCertified: boolean;
    createdAt: string;
    posts: ProfilePostPayload[];
    articles: Array<{
      id: string;
      title: string;
      slug: string;
      content: string;
      published: boolean;
      isPremium: boolean;
      visibility: string;
      readingTime: number;
      createdAt: string;
      publicationId: string;
      author: {
        id: string;
        name: string | null;
        username: string | null;
        logoUrl: string | null;
        subdomain: string | null;
        customDomain: string | null;
        heroText: string | null;
        isCertified: boolean;
        authorName: string | null;
        contributors: Array<{
          id: string;
          name: string | null;
          username: string | null;
          logoUrl: string | null;
          isCertified: boolean;
          role: string;
          order: number;
          isVisible: boolean;
          consentStatus: string;
        }>;
      };
      category: { id: string; name: string; slug: string } | null;
    }>;
    _count: { followers: number; following: number; posts: number; articles: number };
  };
  isFollowing: boolean;
  publicationId: string;
}

function mapProfilePost(fp: ApiFeedPost): ProfilePostPayload {
  const author = fp.author as ApiFeedPost['author'] | undefined;
  return {
    id: fp.id,
    content: fp.content ?? '',
    imageUrl: fp.imageUrl ?? null,
    createdAt: fp.createdAt,
    isPinned: fp.isPinned ?? false,
    author: {
      id: author?.id ?? '',
      name: author?.name ?? null,
      username: author?.username ?? null,
      logoUrl: author?.logoUrl ?? null,
      isCertified: author?.isCertified ?? false,
    },
    parentId: fp.parentId ?? null,
    repostId: fp.repostId ?? null,
    parent: fp.parent ? mapProfilePost(fp.parent) : null,
    repost: fp.repost ? mapProfilePost(fp.repost) : null,
    likesCount: fp.likeCount ?? fp._count?.likes ?? 0,
    repliesCount: fp.replyCount ?? fp._count?.replies ?? 0,
    repostsCount: fp.repostCount ?? fp._count?.reposts ?? 0,
    liked: !!fp.liked,
    _count: fp._count
      ? {
          likes: fp._count.likes,
          replies: fp._count.replies,
          reposts: fp._count.reposts,
        }
      : undefined,
  };
}

function mapProfileSlice(slice: ApiFeedSlice): ProfilePostPayload {
  const base = mapProfilePost(slice.targetPost);
  // Contexte de réponse absent du targetPost → on l'attache depuis la slice.
  if (!base.parent && slice.parentPost) base.parent = mapProfilePost(slice.parentPost);
  return base;
}

function mapProfileArticle(
  a: ApiFeedArticle
): ProfileResolvePayload['profileUser']['articles'][number] {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    content: a.content ?? '',
    published: true,
    isPremium: a.isPremium,
    visibility: a.visibility,
    readingTime: a.readingTime,
    createdAt: a.createdAt,
    publicationId: a.publicationId,
    author: {
      id: a.author.id,
      name: a.author.name,
      username: a.author.username,
      logoUrl: a.author.logoUrl,
      subdomain: a.publication?.subdomain ?? null,
      customDomain: null,
      heroText: null,
      isCertified: a.author.isCertified,
      authorName: a.author.name,
      contributors: [],
    } as ProfileResolvePayload['profileUser']['articles'][number]['author'],
    category: a.category
      ? { id: a.category.id, name: a.category.name, slug: a.category.slug }
      : null,
  };
}

/**
 * 👤 Profil public complet (profil + pensées + articles), depuis l'API Go.
 * Remplace la lecture Prisma directe de getProfileData.ts (web).
 * ⚠️ Go-only — l'API Go EST la source (QOE_API_GO_URL).
 */
export const resolveProfileAction = safeAction<string, ProfileResolvePayload>(
  async (username) => {
    const handle = decodeURIComponent(username).replace(/^@/, '');

    const [profileRaw, postsRes, articlesRes] = await Promise.all([
      goFetch<{ data: PublicProfileData } | PublicProfileData>(
        `/v1/users/${encodeURIComponent(handle)}`
      ),
      goFetch<ApiFeedResult>(`/v1/users/${encodeURIComponent(handle)}/posts?limit=50`),
      goFetch<ApiArticleFeedResult>(`/v1/users/${encodeURIComponent(handle)}/articles?limit=30`),
    ]);

    const profile: PublicProfileData =
      profileRaw && typeof profileRaw === 'object' && 'data' in profileRaw && profileRaw.data
        ? (profileRaw.data as PublicProfileData)
        : (profileRaw as PublicProfileData);

    const profileUser = {
      id: profile.id,
      ownerUserId: profile.ownerUserId ?? null,
      type: profile.type,
      name: profile.name,
      username: profile.slug,
      subdomain: profile.subdomain,
      customDomain: profile.customDomain,
      logoUrl: profile.logoUrl,
      heroText: profile.heroText,
      headerImageUrl: profile.headerImageUrl,
      onboardingText: null,
      isCertified: profile.isCertified,
      createdAt: profile.createdAt,
      posts: postsRes.items.map(mapProfileSlice),
      articles: articlesRes.items.map(mapProfileArticle),
      _count: {
        followers: profile._count?.followers ?? 0,
        following: profile._count?.following ?? 0,
        posts: postsRes.items.length,
        articles: profile._count?.articles ?? articlesRes.items.length,
      },
    };

    return {
      profileUser,
      isFollowing: profile.isFollowing,
      publicationId: profile.id,
    };
  },
  { requireAuth: false }
);
