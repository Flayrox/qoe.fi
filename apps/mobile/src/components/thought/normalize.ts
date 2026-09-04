// =====================================================================
// 🧬 normalize.ts — Normalisation des pensées API vers une shape unique
// =====================================================================
// ✅ AOÛT 2026 : l'API Go renvoie UNE seule shape (`FeedPost`) sur tous les
//    endpoints (feed, thread, posts) — `Thought` en est un alias. La
//    normalisation ne gère plus que FeedPost (+ legacy ThoughtData web),
//    le chemin `viewerLiked`/`viewerReposted` a disparu.
// =====================================================================

import type {
  FeedAttachment,
  FeedAuthor,
  FeedPoll,
  FeedPost,
  QuotedArticle as SdkQuotedArticle,
  ThoughtData,
} from '@qoe/sdk/mobile';

export interface NormalizedAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  isFollowing: boolean;
}

export interface NormalizedQuotedArticle {
  id: string;
  title: string;
  slug: string;
  isPremium: boolean;
  /** Contexte du passage résolu par le serveur (tranche 6-a) — la carte
   *  mobile n'a plus à stripper le HTML ni à re-chercher l'extrait.
   *  Optionnel : absent quand le serveur n'a pas résolu de passage. */
  quoteContext?: SdkQuotedArticle['quoteContext'] | null;
  publication: SdkQuotedArticle['publication'];
  author: SdkQuotedArticle['author'];
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
  poll: FeedPoll | null;
  attachments: FeedAttachment[];
  tags: string[];
  quotedExcerpt?: string | null;
  quotedArticle?: NormalizedQuotedArticle | null;
}

function normAuthor(a?: FeedAuthor | ThoughtData['author'] | null): NormalizedAuthor {
  return {
    id: a?.id ?? '',
    name: a?.name ?? null,
    username: a?.username ?? null,
    logoUrl: a?.logoUrl ?? null,
    isCertified: a?.isCertified ?? false,
    isFollowing: (a as { isFollowing?: boolean } | null)?.isFollowing ?? false,
  };
}

function normPost(p: FeedPost): NormalizedThought {
  return {
    id: p.id,
    content: p.content ?? '',
    createdAt: p.createdAt,
    author: normAuthor(p.author),
    liked: !!p.liked,
    reposted: !!p.reposted,
    likeCount: p.likeCount ?? p._count?.likes ?? 0,
    repostCount: p.repostCount ?? p._count?.reposts ?? 0,
    replyCount: p.replyCount ?? p._count?.replies ?? 0,
    imageUrl: p.imageUrl ?? null,
    isPinned: p.isPinned ?? false,
    isHiddenByAuthor: p.isHiddenByAuthor ?? false,
    replyRestriction: p.replyRestriction ?? 'everyone',
    parentId: p.parentId ?? null,
    rootId: p.rootId ?? null,
    repostId: p.repostId ?? null,
    parent: p.parent ? normPost(p.parent) : null,
    repost: p.repost ? normPost(p.repost) : null,
    poll: p.poll ?? null,
    attachments: p.attachments ?? [],
    tags: p.tags ?? [],
    quotedExcerpt: p.quotedExcerpt ?? null,
    quotedArticle: p.quotedArticle ?? null,
  };
}

function normLegacy(t: ThoughtData): NormalizedThought {
  return {
    id: t.id,
    content: t.content ?? '',
    createdAt: t.createdAt,
    author: normAuthor(t.author),
    liked: !!t.liked || !!t.isLiked,
    reposted: !!t.reposted || !!t.isReposted,
    likeCount: t.likeCount ?? 0,
    repostCount: t.repostCount ?? 0,
    replyCount: t.replyCount ?? 0,
    imageUrl: t.imageUrl ?? null,
    isPinned: false,
    isHiddenByAuthor: false,
    replyRestriction: 'everyone',
    parentId: null,
    rootId: null,
    repostId: null,
    parent: null,
    repost: null,
    poll: null,
    attachments: [],
    tags: [],
    quotedExcerpt: null,
    quotedArticle: null,
  };
}

export type AnyThought = FeedPost | ThoughtData | NormalizedThought;

function isNormalized(input: AnyThought): input is NormalizedThought {
  // Une pensée normalisée n'a PAS de `authorId` racine (l'auteur est dans
  // `author`), contrairement aux shapes API (FeedPost/ThoughtData).
  return (
    !!input &&
    typeof input === 'object' &&
    !('authorId' in input) &&
    'author' in input &&
    'likeCount' in input &&
    'reposted' in input
  );
}

export function normalizeThought(input: AnyThought): NormalizedThought {
  // Déjà normalisé (ancêtres de fil, citations…) → renvoyer tel quel.
  if (isNormalized(input)) {
    return input;
  }
  // FeedPost (shape unique depuis août 2026) : présence de `_count`.
  if ('_count' in input) {
    return normPost(input as unknown as FeedPost);
  }
  // ThoughtData legacy (web, liked/isLiked).
  return normLegacy(input as ThoughtData);
}

/**
 * Résout le post à AFFICHER pour une pensée (repost vs citation) :
 *   - repost pur (pas de texte) → on affiche le post d'origine,
 *   - citation (texte + repost) → on affiche SON texte + la carte citée.
 * Partagé par la carte feed et les cartes de fil pour un rendu cohérent.
 */
export function resolveDisplay(post: NormalizedThought): {
  display: NormalizedThought;
  quoted: NormalizedThought | null;
  isPureRepost: boolean;
} {
  const isPureRepost = !!post.repost && !post.content?.trim();
  const isQuotePost = !!post.repost && !!post.content?.trim();
  return {
    display: isPureRepost && post.repost ? post.repost : post,
    quoted: isQuotePost ? post.repost : null,
    isPureRepost,
  };
}
