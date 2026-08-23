// =====================================================================
// 🧠 Flux « Pour vous » vectoriel — résolution partagée
// =====================================================================
// Le moteur (packages/db/feed.ts) classe les articles et pensées par
// affinité sémantique (pgvector) + circadien + MMR. Ce module résout les
// ids ordonnés vers les enregistrements complets (auteur, publication,
// catégorie, threads…) et les sérialise dans la forme rendue par le
// dashboard. Utilisé par page.tsx (première page, SSR) et par la route
// API /api/feed/personalized (pages suivantes au scroll).
// =====================================================================

import type { Prisma } from '@qoe/db/types';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import {
  formatPollData,
  type FeedPoll,
  type FormattedPoll,
  type FeedSlice,
} from '@qoe/db/repositories/posts';

export const publicationProfileSelect = {
  id: true,
  type: true,
  name: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  logoUrl: true,
  heroText: true,
  isCertified: true,
} as const;

export const articleFeedInclude = {
  publication: { select: publicationProfileSelect },
  author: {
    select: {
      id: true,
      name: true,
      username: true,
      logoUrl: true,
      isCertified: true,
    },
  },
  coAuthors: {
    select: {
      id: true,
      name: true,
      username: true,
      logoUrl: true,
      isCertified: true,
    },
  },
  attributions: {
    orderBy: { order: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
    },
  },
  category: { select: { name: true } },
} satisfies Prisma.ArticleInclude;

export type ArticleWithDetails = Prisma.ArticleGetPayload<{
  include: {
    publication: { select: typeof publicationProfileSelect };
    author: {
      select: {
        id: true;
        name: true;
        username: true;
        logoUrl: true;
        isCertified: true;
      };
    };
    coAuthors: {
      select: {
        id: true;
        name: true;
        username: true;
        logoUrl: true;
        isCertified: true;
      };
    };
    attributions: {
      orderBy: { order: 'asc' };
      include: {
        user: {
          select: {
            id: true;
            name: true;
            username: true;
            logoUrl: true;
            isCertified: true;
          };
        };
      };
    };
    category: { select: { name: true } };
  };
}>;

export interface FeedPostRecord {
  id: string;
  content: string | null;
  imageUrl: string | null;
  createdAt: Date;
  tags?: string[] | null;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    logoUrl: string | null;
    heroText?: string | null;
    isCertified: boolean;
  };
  parent?: {
    id: string;
    content: string | null;
    createdAt: Date;
    author: {
      id: string;
      name: string | null;
      username: string | null;
      logoUrl: string | null;
      isCertified: boolean;
    };
  } | null;
  repost?: FeedPostRecord | null;
  quotedExcerpt?: string | null;
  quotedArticle?: {
    id: string;
    title: string;
    slug: string;
    content: string;
    isPremium: boolean;
    publication: {
      name: string;
      slug: string;
      subdomain: string | null;
      customDomain: string | null;
      type: 'PERSONAL' | 'MEDIA';
      logoUrl: string | null;
      isCertified: boolean;
    };
    author: {
      id: string;
      name: string | null;
      username: string | null;
      logoUrl: string | null;
      isCertified: boolean;
    };
  } | null;
  likes?: { userId: string }[];
  reposts?: { id: string; authorId?: string; content?: string | null }[];
  _count?: { likes: number; replies: number; reposts: number };
  poll?: FeedPoll | FormattedPoll | null;
}

export const getPostIncludeSelect = (userId?: string) => ({
  author: {
    select: {
      id: true,
      name: true,
      username: true,
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
          logoUrl: true,
          isCertified: true,
        },
      },
      likes: userId ? { where: { userId }, select: { userId: true } } : false,
      reposts: userId
        ? {
            where: { authorId: userId, deletedAt: null },
            select: { id: true, authorId: true, content: true },
          }
        : false,
      _count: { select: { likes: true, replies: true, reposts: true } },
    },
  },
  quotedArticle: {
    include: {
      publication: {
        select: {
          id: true,
          type: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          isCertified: true,
        },
      },
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
  },
  likes: userId ? { where: { userId }, select: { userId: true } } : false,
  reposts: userId
    ? {
        where: { authorId: userId, deletedAt: null },
        select: { id: true, authorId: true, content: true },
      }
    : false,
  poll: {
    include: {
      options: {
        orderBy: { order: 'asc' as const },
        include: { _count: { select: { votes: true } } },
      },
      votes: { select: { optionId: true, userId: true } },
    },
  },
  _count: { select: { likes: true, replies: true, reposts: true } },
});

export const mapPublicationToAuthor = (
  pub: {
    id: string;
    type: 'PERSONAL' | 'MEDIA';
    name: string | null;
    slug: string;
    subdomain: string | null;
    customDomain: string | null;
    logoUrl: string | null;
    heroText: string | null;
    isCertified: boolean;
  },
  authorName?: string | null,
  authorLogoUrl?: string | null
) => ({
  id: pub.id,
  name: pub.name,
  username: pub.slug,
  subdomain: pub.subdomain,
  customDomain: pub.customDomain,
  logoUrl: pub.type === 'PERSONAL' ? (authorLogoUrl ?? pub.logoUrl) : pub.logoUrl,
  heroText: pub.heroText ?? null,
  isCertified: pub.isCertified ?? false,
  type: pub.type,
  authorName: authorName ?? null,
});

export const mapQuotedArticle = (article: FeedPostRecord['quotedArticle']) =>
  article
    ? {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        isPremium: article.isPremium,
        author: {
          id: article.author.id,
          name: article.author.name,
          username: article.author.username,
          subdomain: article.publication.subdomain,
          logoUrl: article.publication.logoUrl,
          isCertified: article.publication.isCertified,
        },
      }
    : null;

export const mapPostToFeedItem = (post: FeedPostRecord, currentUserId?: string) => {
  const canonicalPost = post.repost || post;
  const likesCount = canonicalPost._count?.likes ?? post._count?.likes ?? 0;
  const repliesCount = canonicalPost._count?.replies ?? post._count?.replies ?? 0;
  const repostsCount = canonicalPost._count?.reposts ?? post._count?.reposts ?? 0;

  const liked =
    (canonicalPost.likes && Array.isArray(canonicalPost.likes) && canonicalPost.likes.length > 0) ||
    (post.likes && Array.isArray(post.likes) && post.likes.length > 0) ||
    false;

  const reposted =
    (canonicalPost.reposts &&
      Array.isArray(canonicalPost.reposts) &&
      canonicalPost.reposts.some((r) => !r.content || !r.content.trim())) ||
    (post.reposts &&
      Array.isArray(post.reposts) &&
      post.reposts.some((r) => !r.content || !r.content.trim())) ||
    false;

  return {
    id: post.id,
    title: '', // Un titre vide identifie un micro-post dans FeedDashboard
    slug: `post-${post.id}`,
    content: post.content,
    imageUrl: post.imageUrl || null,
    quotedExcerpt: post.quotedExcerpt || canonicalPost.quotedExcerpt || undefined,
    articleQuote: mapQuotedArticle(post.quotedArticle || canonicalPost.quotedArticle),
    published: true,
    isPremium: false,
    readingTime: 1,
    createdAt: post.createdAt.toISOString(),
    author: {
      ...post.author,
      heroText: post.author?.heroText ?? null,
      isCertified: post.author?.isCertified || false,
    },
    parent: post.parent
      ? {
          ...post.parent,
          createdAt: post.parent.createdAt ? post.parent.createdAt.toISOString() : undefined,
          author: {
            ...post.parent.author,
            isCertified: post.parent.author?.isCertified || false,
          },
        }
      : null,
    repost: post.repost
      ? {
          ...post.repost,
          createdAt: post.repost.createdAt
            ? post.repost.createdAt.toISOString()
            : post.createdAt.toISOString(),
          author: {
            ...post.repost.author,
            isCertified: post.repost.author?.isCertified || false,
          },
        }
      : null,
    category: { name: 'Micro-post' },
    tags: post.tags || [],
    likesCount,
    repliesCount,
    repostsCount,
    liked,
    reposted,
    poll: canonicalPost.poll
      ? formatPollData(canonicalPost.poll as FeedPoll, currentUserId)
      : post.poll
        ? formatPollData(post.poll as FeedPoll, currentUserId)
        : null,
  };
};

export const mapArticleToFeedItem = (art: ArticleWithDetails) => ({
  ...art,
  // Les Dates viennent de unstable_cache / sérialisation : normalisation ISO.
  createdAt: (art.createdAt instanceof Date
    ? art.createdAt
    : new Date(art.createdAt)
  ).toISOString(),
  author: {
    ...mapPublicationToAuthor(art.publication, art.author?.name, art.author?.logoUrl),
    journalist: art.author
      ? {
          id: art.author.id,
          name: art.author.name,
          username: art.author.username,
          logoUrl: art.author.logoUrl,
          isCertified: art.author.isCertified,
        }
      : null,
    coAuthors: art.coAuthors
      .filter((coAuthor) => {
        if (art.attributions.length === 0) return true;
        return art.attributions.some(
          (attribution) =>
            attribution.user.id === coAuthor.id &&
            attribution.consentStatus === 'ACCEPTED' &&
            attribution.isVisible
        );
      })
      .map((coAuthor) => ({
        id: coAuthor.id,
        name: coAuthor.name,
        username: coAuthor.username,
        logoUrl: coAuthor.logoUrl,
        isCertified: coAuthor.isCertified,
      })),
    contributors: art.attributions
      .filter((attribution) => attribution.consentStatus === 'ACCEPTED' && attribution.isVisible)
      .map((attribution) => ({
        id: attribution.user.id,
        name: attribution.user.name,
        username: attribution.user.username,
        logoUrl: attribution.user.logoUrl,
        isCertified: attribution.user.isCertified,
        role: attribution.role,
        order: attribution.order,
        isVisible: attribution.isVisible,
        consentStatus: attribution.consentStatus,
      })),
  },
  tags: art.semanticTags || [],
});

export const mapSliceToFeedItem = (slice: FeedSlice, currentUserId?: string) => {
  const target = slice.targetPost;
  return {
    id: slice.id,
    title: '',
    slug: `post-${slice.id}`,
    createdAt: target.createdAt instanceof Date ? target.createdAt.toISOString() : target.createdAt,
    targetPost: mapPostToFeedItem(target, currentUserId),
    parentPost: slice.parentPost ? mapPostToFeedItem(slice.parentPost, currentUserId) : null,
    rootPost: slice.rootPost ? mapPostToFeedItem(slice.rootPost, currentUserId) : null,
    isIncompleteThread: slice.isIncompleteThread,
    hiddenIntermediateCount: slice.hiddenIntermediateCount,
  };
};

export type FeedItem =
  | (ReturnType<typeof mapArticleToFeedItem> & { isDiscovery?: boolean })
  | ReturnType<typeof mapSliceToFeedItem>;

export interface VectorFeedPageResult {
  items: FeedItem[];
  hasMore: boolean;
  nextOffset: number;
}

/**
 * 🎯 Résout une page du flux « Pour vous » : le moteur vectoriel classe
 * (pgvector + circadien + MMR, cold-start fraîcheur/engagement si userId
 * est null), puis on charge les enregistrements complets et on les
 * sérialise dans l'ordre du moteur.
 */
// ── Cache mémoire TTL 60s (Phase 4) ─────────────────────────────────────────
// Le moteur (pgvector + CF + engagement + exploration) coûte ~60-100ms/user.
// Cache de la partie moteur uniquement ; la réhydratation Prisma reste fraîche.
// Map insertion-order = LRU simplifié ; 0 dépendance externe.
const FEED_CACHE_TTL_MS = 60_000;
const FEED_CACHE_MAX_ENTRIES = 500;

// Moteur classé par le backend Go (GET /v1/feed/personalized) : items légers
// {itemType, id, isDiscovery} + hasMore. La réhydratation complète reste Prisma.
type EngineItem = { itemType: 'ARTICLE' | 'THOUGHT'; id: string; isDiscovery?: boolean };
interface EngineResult {
  items: EngineItem[];
  hasMore: boolean;
  nextCursor?: string;
}
type EnginePage = EngineResult;

// Réhydratation Go (POST /v1/feed/hydrate) — shape miroir du JSON Go.
interface HydrateAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
}
interface HydratePublication {
  id: string;
  type: string;
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified: boolean;
}
interface HydrateAttribution {
  user: HydrateAuthor;
  role: string;
  order: number;
  isVisible: boolean;
  consentStatus: string;
}
interface HydrateArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl: string | null;
  published: boolean;
  isPremium: boolean;
  visibility: string;
  readingTime: number;
  status: string;
  completionRate: number;
  semanticTags: string[];
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  scheduledAt: string | null;
  publicationId: string;
  authorId: string;
  categoryId: string | null;
  tierId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
  author: HydrateAuthor;
  publication: HydratePublication;
  coAuthors: HydrateAuthor[];
  attributions: HydrateAttribution[];
}
interface HydrateResponse {
  articles: HydrateArticle[];
  thoughts: FeedSlice[];
}
const feedEngineCache = new Map<string, { expires: number; data: Promise<EnginePage> }>();

async function getEnginePage(
  userId: string | null,
  limit: number,
  offset: number
): Promise<EnginePage> {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    userHour: String(new Date().getHours()), // circadien
  });
  if (userId) qs.set('userId', userId);
  return goFetch<EnginePage>(`/v1/feed/personalized?${qs.toString()}`);
}

function getCachedEnginePage(
  userId: string | null,
  limit: number,
  offset: number
): Promise<EnginePage> {
  const key = `${userId ?? 'anon'}:${limit}:${offset}`;
  const hit = feedEngineCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const promise = getEnginePage(userId, limit, offset);
  feedEngineCache.set(key, { expires: Date.now() + FEED_CACHE_TTL_MS, data: promise });

  // Éviction LRU simple : on supprime l'entrée la plus ancienne si trop plein
  if (feedEngineCache.size > FEED_CACHE_MAX_ENTRIES) {
    const oldest = feedEngineCache.keys().next().value;
    if (oldest !== undefined) feedEngineCache.delete(oldest);
  }
  return promise;
}

export async function buildVectorFeedPage(params: {
  userId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<VectorFeedPageResult> {
  const { userId = null, limit = 20, offset = 0 } = params;
  // Le moteur Go calcule hasMore ; il renvoie déjà au plus `limit` items.
  const { items: engineItems, hasMore } = await getCachedEnginePage(userId, limit, offset);

  const pageItems = engineItems.slice(0, limit);

  // Réhydratation 100% Go : articles complets + pensées (FeedSlice).
  const { articles, thoughts } = await goFetch<HydrateResponse>('/v1/feed/hydrate', {
    method: 'POST',
    body: { items: pageItems },
  });

  // Le JSON Go respecte le contrat Prisma lu par mapArticleToFeedItem.
  const vectorArticles = articles as unknown as ArticleWithDetails[];
  const vectorSlices = thoughts;
  const articleById = new Map(vectorArticles.map((a) => [a.id, a]));
  const sliceById = new Map(vectorSlices.map((s) => [s.id, s]));

  const items: FeedItem[] = [];
  for (const item of pageItems) {
    if (item.itemType === 'ARTICLE') {
      const art = articleById.get(item.id);
      if (art)
        items.push({
          ...mapArticleToFeedItem(art),
          // 🌍 transport du flag exploration (badge « Découverte » côté UI)
          ...(item.isDiscovery ? { isDiscovery: true } : {}),
        });
    } else {
      const slice = sliceById.get(item.id);
      if (slice) items.push(mapSliceToFeedItem(slice, userId ?? undefined));
    }
  }

  return { items, hasMore, nextOffset: offset + items.length };
}
