'use server';

// =====================================================================
// 🍞 actions/feed — Server Actions du feed & des pensées (web uniquement)
// =====================================================================
// Le plus gros module d'actions : lecture/écriture du feed, pensées
// (threads, likes, reposts, bookmarks, rapports), profils publics, drafts,
// épinglage, unfurl de liens, réglages de modération.
//
// 🔗 GO-ONLY : l'API Go est la source de vérité (QOE_API_URL requis,
//    backend-of-record). Toutes les actions délèguent au backend Go
//    (apps/api) via `goFetch()` — le contrat TS (ActionResult<T>) reste
//    identique, seules l'implémentation et l'authentification changent
//    (JWT en header).
//
// ⚠️ Fichier serveur : NON exposé au mobile via @qoe/api-client/mobile.
//    Le mobile appelle directement l'API Go (QoeApiClient.getFeed,
//    toggleLike, toggleRepost, toggleBookmark…). Les contrats de données
//    correspondent à ceux de `@qoe/api-client/types`.
// =====================================================================

import { replyToPostSchema, createReportSchema, type CreateReportInput } from '@qoe/config';
import { goFetch } from '../utils/go-client';
import type { MeProfileDTO } from '../auth';

import { safeAction } from '../utils/safe-action';
import { getActivePublicationId } from '../articles';
import type {
  FeedSlice as ApiFeedSlice,
  FeedPost as ApiFeedPost,
  FeedArticle as ApiFeedArticle,
  FeedResult as ApiFeedResult,
  ArticleFeedResult as ApiArticleFeedResult,
  PublicProfileData,
  FollowActor as ApiFollowActor,
} from '../../types';

/** Résultat du découpage paywall (shape Go GET /v1/articles/{slug}). */
export interface PaywallCutResult {
  content: string;
  isTruncated: boolean;
  accessGranted: boolean;
  paywallMeta: {
    visibility: string;
    teaserParagraphsCount: number;
    requiredTierId: string | null;
    totalLengthBytes: number;
    previewLengthBytes: number;
  } | null;
}

/** Pensée web (shape thread reconstruit côté web depuis l'API Go). */
export interface WebThreadPost {
  id: string;
  content: string;
  authorId: string;
  imageUrl: string | null;
  createdAt: string;
  triggerWarning: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  isHiddenByAuthor: boolean;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  };
  parentId: string | null;
  rootId: string | null;
  repostId: string | null;
  parent: WebThreadPost | null;
  repost: WebThreadPost | null;
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  /** Alias ThoughtData (compat ThoughtCard/OptimisticThought). */
  likeCount: number;
  replyCount: number;
  repostCount: number;
  liked: boolean;
  reposted: boolean;
  likes: Array<{ userId: string }>;
  _count: { likes: number; replies: number; reposts: number };
  attachments: Array<{ id?: string; url: string; type?: string; altText?: string | null }>;
  poll:
    | {
        id: string;
        thoughtId: string;
        expiresAt: string;
        isExpired: boolean;
        totalVotes: number;
        userVotedOptionId: string | null;
        options: Array<{
          id: string;
          text: string;
          order: number;
          voteCount: number;
          percentage: number;
        }>;
      }
    | null
    | undefined;
  tags: string[];
  replyRestriction: string;
  replies: WebThreadPost[];
}

type ThoughtThreadPost = WebThreadPost;
type Reply = WebThreadPost;
type ThreadPost = WebThreadPost;
type RepostResult = { post?: WebThreadPost };
type Draft = {
  id: string;
  content?: string | null;
  imageUrl?: string | null;
  visibility?: string;
  scheduledAt?: string | null;
  triggerWarning?: string | null;
  tags?: string[];
  updatedAt?: string | Date;
};
/** 📰 Article web (shape Go GET /v1/articles/{slug} — paywall inclus). */
export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  publicationId: string;
  authorId: string;
  isTruncated: boolean;
  accessGranted: boolean;
  paywallMeta: unknown;
  author: Record<string, unknown>;
  category: { name: string } | null;
  tags?: string[];
}
type SearchedUser = {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
};

// Contrat Go GET /v1/users/search (autocomplétion mentions @)
interface GoSearchUser {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
}

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
export interface FollowActorWebDTO {
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

export const getFollowListAction = safeAction<
  { handle: string; tab: 'followers' | 'following'; cursor?: number; limit?: number },
  { items: FollowActorWebDTO[]; nextCursor: string | null; hasMore: boolean }
>(
  async ({ handle, tab, cursor = 0, limit = 30 }) => {
    const clean = decodeURIComponent(handle).replace(/^@/, '');
    const path = tab === 'followers' ? 'followers' : 'following';
    const page = await goFetch<{ items: ApiFollowActor[]; nextCursor: string; hasMore: boolean }>(
      `/v1/users/${encodeURIComponent(clean)}/${path}?limit=${limit}&cursor=${cursor}`
    );
    const items: FollowActorWebDTO[] = (page.items ?? []).map((a) => ({
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
  async (articleId) => {
    // ✅ Go-only : DB + invalidation cache
    return goFetch<{ bookmarked: boolean }>(`/v1/posts/${articleId}/bookmark`, {
      method: 'POST',
    });
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
>(async (rawInput) => {
  const { thoughts, isDraft, scheduledAt, replyRestriction, parentId } = rawInput;

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

  // 2. Publication du fil côté Go : chaque pensée est créée séquentiellement,
  //    chaînée par parentId (le Go supporte threads + drafts + scheduling +
  //    citations + sondages via POST /v1/posts).
  const createdPosts: ThoughtThreadPost[] = [];
  let chainParentId: string | null = parentId || null;
  for (let i = 0; i < thoughts.length; i++) {
    const t = thoughts[i];
    const created = await goFetch<Record<string, unknown>>('/v1/posts', {
      method: 'POST',
      body: {
        content: t.content,
        tags: t.tags ?? [],
        imageUrl: t.imageUrl || null,
        attachments: t.attachments ?? [],
        quotedArticleId: t.quotedArticleId || null,
        quotedExcerpt: t.quotedExcerpt || null,
        triggerWarning: t.triggerWarning || null,
        poll: t.poll ?? null,
        isDraft: isDraft ?? false,
        scheduledAt: scheduledAt ?? null,
        replyRestriction: replyRestriction ?? 'everyone',
        parentId: chainParentId ?? null,
      },
    });
    createdPosts.push(created as unknown as WebThreadPost);
    if (i === 0 && created?.id) {
      chainParentId = created.id as string;
    }
  }

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
  async (slug) => {
    // Go-only : GET /v1/articles/{slug} — le paywall est tronqué côté serveur
    // (isTruncated/accessGranted/paywallMeta renvoyés par le Go).
    try {
      const article = await goFetch<
        ArticleRecord & {
          isTruncated: boolean;
          accessGranted: boolean;
          paywallMeta: PaywallCutResult['paywallMeta'];
        }
      >(`/v1/articles/${encodeURIComponent(slug)}`);
      return { article: article as unknown as ArticleRecord & PaywallCutResult };
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) return { article: null };
      throw err;
    }
  },
  { requireAuth: false }
);

export const reportTargetAction = safeAction<CreateReportInput, { success: boolean }>(
  async (rawInput) => {
    const { targetId, targetType, reason, details } = createReportSchema.parse(rawInput);
    // Go-only : POST /v1/reports.
    await goFetch('/v1/reports', {
      method: 'POST',
      body: {
        targetId,
        targetType: targetType as 'thought' | 'article' | 'user' | 'comment',
        reason,
        details: details || null,
      },
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

export const getUserDraftsAction = safeAction<void, { drafts: Draft[] }>(async () => {
  // Go-only : GET /v1/posts/drafts (brouillons isDraft=true).
  const res = await goFetch<{ drafts: Draft[] }>('/v1/posts/drafts');
  return { drafts: res.drafts ?? [] };
});

export const pinPostAction = safeAction<string, { success: boolean; pinned?: boolean }>(
  async (postId) => {
    // ✅ Go-only : DB + invalidation cache
    const res = await goFetch<{ pinned: boolean }>(`/v1/posts/${postId}/pin`, {
      method: 'POST',
    });
    return { success: true, pinned: res.pinned };
  }
);

export const unpinPostAction = safeAction<string, { success: boolean; pinned?: boolean }>(
  async (postId) => {
    // ✅ Go-only : DB + invalidation cache
    const res = await goFetch<{ pinned: boolean }>(`/v1/posts/${postId}/pin`, {
      method: 'POST',
    });
    return { success: true, pinned: res.pinned };
  }
);

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
          // Go-only : GET /v1/posts/{id} (thread/quote du post interne).
          const post = await goFetch<ThreadPost>(`/v1/posts/${encodeURIComponent(postId)}`).catch(
            () => null
          );
          if (post) {
            const result: UnfurlResult = { isInternal: true, postType: 'post', data: post };
            unfurlCache.set(url, result);
            return result;
          }
        }

        const articleMatch = parsedUrl.pathname.match(/\/article\/([a-zA-Z0-9_-]+)/);
        if (articleMatch) {
          const slug = articleMatch[1];
          // Go-only : GET /v1/articles/{slug}.
          const article = await goFetch<ArticleRecord>(
            `/v1/articles/${encodeURIComponent(slug)}`
          ).catch(() => null);
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
export interface UpdatedProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  heroText: string | null;
  headerImageUrl: string | null;
  onboardingText: string | null;
  isCertified: boolean;
}

export const updateProfileAction = safeAction<
  {
    name?: string;
    heroText?: string;
    onboardingText?: string;
    logoUrl?: string;
    headerImageUrl?: string;
  },
  { user: UpdatedProfileUser }
>(async (input) => {
  // Go-only : PATCH /v1/me/profile (champs lecteur) + PATCH /v1/settings/profile
  // (champs créateur : heroText, headerImageUrl) via la publication active.
  const [profile, publication] = await Promise.all([
    goFetch<MeProfileDTO & { isCertified?: boolean }>('/v1/me/profile', {
      method: 'PATCH',
      body: {
        name: input.name ?? undefined,
        logoUrl: input.logoUrl ?? undefined,
        onboardingText: input.onboardingText ?? undefined,
      },
    }),
    (async () => {
      if (input.heroText === undefined && input.headerImageUrl === undefined) {
        return null;
      }
      const publicationId = await getActivePublicationId();
      return goFetch<Record<string, unknown>>('/v1/settings/profile', {
        method: 'PATCH',
        body: {
          publicationId,
          heroText: input.heroText ?? undefined,
          headerImageUrl: input.headerImageUrl ?? undefined,
        },
      });
    })(),
  ]);

  const pub = (publication ?? {}) as Record<string, unknown>;
  return {
    user: {
      id: profile.id,
      name: profile.name ?? null,
      username: profile.username ?? null,
      logoUrl: profile.logoUrl ?? null,
      heroText: (pub.heroText as string | null) ?? null,
      headerImageUrl: (pub.headerImageUrl as string | null) ?? null,
      onboardingText:
        (profile as unknown as { onboardingText?: string | null }).onboardingText ?? null,
      isCertified: profile.isCertified ?? false,
    },
  };
});

export const searchUsersAction = safeAction<string, { users: SearchedUser[] }>(
  async (query) => {
    // Go-only (GET /v1/users/search : autocomplétion mentions).
    const q = query.trim().replace(/^@/, '');
    if (!q) return { users: [] };
    const list = await goFetch<GoSearchUser[]>(`/v1/users/search?q=${encodeURIComponent(q)}`);
    return { users: list as unknown as SearchedUser[] };
  },
  { requireAuth: false }
);

export const toggleHideReplyAction = safeAction<string, { isHiddenByAuthor: boolean }>(
  async (replyId) => {
    // Go-only : seul l'auteur de la pensée parente peut masquer.
    const updated = await goFetch<{ isHiddenByAuthor: boolean }>(
      `/v1/posts/${encodeURIComponent(replyId)}/hide`,
      { method: 'POST' }
    );
    return { isHiddenByAuthor: updated.isHiddenByAuthor };
  }
);

export const canUserReplyAction = safeAction<
  string,
  { canReply: boolean; reason?: string; restriction: string }
>(
  async (thoughtId) => {
    // Go-only : threadgate vérifié côté backend.
    const res = await goFetch<{ canReply: boolean; reason?: string; restriction: string }>(
      `/v1/posts/${encodeURIComponent(thoughtId)}/can-reply`
    );
    return { canReply: res.canReply, reason: res.reason, restriction: res.restriction };
  },
  { requireAuth: false }
);

export const toggleBlockUserAction = safeAction<string, { blocked: boolean }>(
  async (targetUserId) => {
    // Go-only : POST /v1/users/{id}/block.
    const res = await goFetch<{ blocked: boolean }>(
      `/v1/users/${encodeURIComponent(targetUserId)}/block`,
      { method: 'POST' }
    );
    return { blocked: res.blocked };
  }
);

export const toggleMuteWordAction = safeAction<string, { muted: boolean; word: string }>(
  async (word) => {
    // Go-only : POST /v1/me/muted-words.
    const res = await goFetch<{ muted: boolean; word: string }>('/v1/me/muted-words', {
      method: 'POST',
      body: { word },
    });
    return { muted: res.muted, word: res.word };
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
  { items: ApiFeedSlice[]; nextCursor: string | null; hasMore: boolean }
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
      items: body.items as unknown as ApiFeedSlice[],
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
  isDeleted?: boolean;
  isHiddenByAuthor?: boolean;
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
  reposted?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
  attachments?: Array<{ id?: string; url: string; type?: string; altText?: string | null }> | null;
  tags?: string[];
  poll?: {
    id: string;
    thoughtId: string;
    expiresAt: string | Date;
    isExpired: boolean;
    totalVotes: number;
    userVotedOptionId: string | null;
    options: Array<{
      id: string;
      text: string;
      order: number;
      voteCount: number;
      percentage: number;
    }>;
  } | null;
  replyRestriction?: string;
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

function mapProfilePost(fp: ApiFeedPost | RawPostPayload): ProfilePostPayload {
  const raw = fp as RawPostPayload;
  const author = (raw.author || {}) as Record<string, unknown>;
  const counts = (raw._count || {}) as Record<string, unknown>;
  const likesCount =
    typeof raw.likesCount === 'number'
      ? raw.likesCount
      : typeof raw.likeCount === 'number'
        ? raw.likeCount
        : typeof counts.likes === 'number'
          ? counts.likes
          : 0;
  const repliesCount =
    typeof raw.repliesCount === 'number'
      ? raw.repliesCount
      : typeof raw.replyCount === 'number'
        ? raw.replyCount
        : typeof counts.replies === 'number'
          ? counts.replies
          : 0;
  const repostsCount =
    typeof raw.repostsCount === 'number'
      ? raw.repostsCount
      : typeof raw.repostCount === 'number'
        ? raw.repostCount
        : typeof counts.reposts === 'number'
          ? counts.reposts
          : 0;

  return {
    id: raw.id as string,
    content: (raw.content as string) ?? '',
    imageUrl: (raw.imageUrl as string | null) ?? null,
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    triggerWarning: (raw.triggerWarning as string | null) ?? null,
    isPinned: Boolean(raw.isPinned),
    isDeleted: Boolean(raw.isDeleted),
    isHiddenByAuthor: Boolean(raw.isHiddenByAuthor),
    author: {
      id: (author.id as string) ?? (raw.authorId as string) ?? '',
      name: (author.name as string | null) ?? null,
      username: (author.username as string | null) ?? null,
      logoUrl: (author.logoUrl as string | null) ?? null,
      isCertified: Boolean(author.isCertified),
    },
    parentId: (raw.parentId as string | null) ?? null,
    repostId: (raw.repostId as string | null) ?? null,
    parent: raw.parent ? mapProfilePost(raw.parent as RawPostPayload) : null,
    repost: raw.repost ? mapProfilePost(raw.repost as RawPostPayload) : null,
    likesCount,
    repliesCount,
    repostsCount,
    liked: Boolean(raw.liked),
    reposted: Boolean(raw.reposted),
    _count: {
      likes: likesCount,
      replies: repliesCount,
      reposts: repostsCount,
    },
    attachments: (raw.attachments as ProfilePostPayload['attachments']) ?? null,
    tags: (raw.tags as string[]) ?? [],
    poll: (raw.poll as ProfilePostPayload['poll']) ?? null,
    replyRestriction: (raw.replyRestriction as string) ?? 'everyone',
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
 * ⚠️ Go-only — l'API Go EST la source (QOE_API_URL).
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
      pronouns: profile.pronouns ?? null,
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
