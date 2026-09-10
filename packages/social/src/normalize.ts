// =====================================================================
// 🧬 normalize.ts — Normalisation des pensées et résolution d'affichage
// =====================================================================

export interface NormalizedAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  isFollowing: boolean;
}

export interface NormalizedThought {
  id: string;
  content: string;
  createdAt: string;
  author: NormalizedAuthor;
  liked: boolean;
  reposted: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  imageUrl: string | null;
  isPinned: boolean;
  isHiddenByAuthor: boolean;
  replyRestriction: string;
  parentId: string | null;
  rootId: string | null;
  repostId: string | null;
  parent: NormalizedThought | null;
  repost: NormalizedThought | null;
  poll: unknown | null;
  attachments: unknown[];
  tags: string[];
  quotedExcerpt?: string | null;
  quotedArticle?: unknown | null;
}

export function normalizeAuthor(raw?: Record<string, unknown> | null): NormalizedAuthor {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    name: typeof raw?.name === 'string' ? raw.name : null,
    username: typeof raw?.username === 'string' ? raw.username : null,
    logoUrl: typeof raw?.logoUrl === 'string' ? raw.logoUrl : null,
    isCertified: Boolean(raw?.isCertified),
    isFollowing: Boolean(raw?.isFollowing),
  };
}

export function isNormalizedThought(input: unknown): input is NormalizedThought {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return !('authorId' in obj) && 'author' in obj && 'likeCount' in obj && 'reposted' in obj;
}

/**
 * Normalise n'importe quelle shape de pensée (FeedPost Go, ThoughtData legacy ou NormalizedThought).
 */
export function normalizeThought(input: unknown): NormalizedThought {
  if (isNormalizedThought(input)) {
    return input;
  }

  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const counts = (raw._count && typeof raw._count === 'object' ? raw._count : {}) as Record<
    string,
    number
  >;

  const parent = raw.parent ? normalizeThought(raw.parent) : null;
  const repost = raw.repost ? normalizeThought(raw.repost) : null;

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : typeof raw.createdAt === 'string'
          ? raw.createdAt
          : new Date().toISOString(),
    author: normalizeAuthor(raw.author as Record<string, unknown> | null),
    liked: Boolean(raw.liked || raw.isLiked),
    reposted: Boolean(raw.reposted || raw.isReposted),
    likeCount:
      typeof raw.likeCount === 'number'
        ? raw.likeCount
        : typeof counts.likes === 'number'
          ? counts.likes
          : 0,
    repostCount:
      typeof raw.repostCount === 'number'
        ? raw.repostCount
        : typeof counts.reposts === 'number'
          ? counts.reposts
          : 0,
    replyCount:
      typeof raw.replyCount === 'number'
        ? raw.replyCount
        : typeof counts.replies === 'number'
          ? counts.replies
          : 0,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
    isPinned: Boolean(raw.isPinned),
    isHiddenByAuthor: Boolean(raw.isHiddenByAuthor),
    replyRestriction: typeof raw.replyRestriction === 'string' ? raw.replyRestriction : 'everyone',
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    rootId: typeof raw.rootId === 'string' ? raw.rootId : null,
    repostId: typeof raw.repostId === 'string' ? raw.repostId : null,
    parent,
    repost,
    poll: raw.poll ?? null,
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    quotedExcerpt: typeof raw.quotedExcerpt === 'string' ? raw.quotedExcerpt : null,
    quotedArticle: raw.quotedArticle ?? null,
  };
}

/**
 * Résout le post à AFFICHER pour une pensée (repost vs citation) :
 * - repost pur (pas de texte propre) → on affiche le post d'origine,
 * - citation (texte propre + repost) → on affiche SON texte + la carte citée.
 */
export function resolveDisplay(post: NormalizedThought): {
  display: NormalizedThought;
  quoted: NormalizedThought | null;
  isPureRepost: boolean;
} {
  const isPureRepost = Boolean(post.repost && !post.content?.trim());
  const isQuotePost = Boolean(post.repost && post.content?.trim());

  return {
    display: isPureRepost && post.repost ? post.repost : post,
    quoted: isQuotePost ? post.repost : null,
    isPureRepost,
  };
}
