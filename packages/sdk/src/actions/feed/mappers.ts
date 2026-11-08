// =====================================================================
// 🍞 actions/feed/mappers — Fonctions pures de transformation de données
// =====================================================================
// ⚠️ CE FICHIER N'EST PAS UN MODULE SERVER ACTIONS ('use server').
// Il contient exclusivement des fonctions synchrones et des types purs de
// normalisation (payloads Go -> shapes Web).
//
// Règle Next.js : Tout fichier avec 'use server' ne peut exporter que des
// fonctions asynchrones (Server Actions). Les mappers et helpers synchrones
// doivent résider dans ce fichier pur pour éviter toute erreur de compilation
// "Server Actions must be async functions" côté client / SSR.
// =====================================================================

import type {
  QuoteContext,
  FeedSlice as ApiFeedSlice,
  FeedPost as ApiFeedPost,
  PostCapabilities,
} from '../../types';

export type RawPostPayload = Record<string, unknown>;

/** Annotation citée brute (shape Go `QuotedAnnotation`). */
export interface RawQuotedAnnotation {
  id: string;
  note: string;
  excerpt: string;
  quoteOrdinal?: number | null;
  canonicalStart?: number | null;
  canonicalEnd?: number | null;
  contentSha?: string | null;
  reader?: {
    id?: string | null;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  } | null;
}

/** Article cité brut (shape Go `QuotedArticle`). */
export interface RawQuotedArticle {
  id: string;
  title: string;
  slug: string;
  content?: string | null;
  isPremium?: boolean;
  quoteContext?: {
    before: string;
    highlight: string;
    after: string;
    start: number;
    end: number;
    sha: string;
  } | null;
  publication?: {
    name?: string | null;
    slug?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    type?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  } | null;
  author?: {
    id?: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  } | null;
}

export type MappedQuotedAnnotation = {
  id: string;
  note: string;
  excerpt: string;
  quoteOrdinal: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  contentSha?: string;
  reader: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    type?: string;
  };
} | null;

export type MappedQuotedArticle = {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  isPremium: boolean;
  quoteContext: QuoteContext | null;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain: string | null;
    logoUrl: string | null;
    isCertified: boolean;
    type?: string;
  };
  publication: {
    name: string | null;
    subdomain: string | null;
    customDomain: string | null;
  } | null;
} | null;

export function mapQuotedAnnotationForCard(
  citation: RawQuotedAnnotation | null | undefined
): MappedQuotedAnnotation {
  if (!citation || !citation.id) return null;
  return {
    id: citation.id,
    note: citation.note,
    excerpt: citation.excerpt,
    quoteOrdinal: citation.quoteOrdinal ?? 0,
    canonicalStart: citation.canonicalStart ?? undefined,
    canonicalEnd: citation.canonicalEnd ?? undefined,
    contentSha: citation.contentSha ?? undefined,
    reader: {
      id: citation.reader?.id ?? '',
      name: citation.reader?.name ?? null,
      username: citation.reader?.username ?? null,
      logoUrl: citation.reader?.logoUrl ?? null,
      type: citation.reader?.type ?? undefined,
    },
  };
}

export function mapQuotedArticleForCard(
  article: RawQuotedArticle | null | undefined
): MappedQuotedArticle {
  if (!article || !article.id) return null;
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content ?? null,
    isPremium: Boolean(article.isPremium),
    quoteContext: article.quoteContext ?? null,
    author: {
      id: article.author?.id ?? '',
      name: article.author?.name ?? null,
      username: article.author?.username ?? null,
      subdomain: article.publication?.subdomain ?? null,
      logoUrl: article.publication?.logoUrl ?? article.author?.logoUrl ?? null,
      isCertified: Boolean(article.author?.isCertified ?? article.publication?.isCertified),
      type: article.author?.type ?? article.publication?.type ?? undefined,
    },
    publication: article.publication
      ? {
          name: article.publication.name ?? null,
          subdomain: article.publication.subdomain ?? null,
          customDomain: article.publication.customDomain ?? null,
        }
      : null,
  };
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
    /** Nature publique du compte — décide de la forme de l'avatar. */
    type?: 'PERSONAL' | 'MEDIA' | string | null;
    isMuted?: boolean;
    isBlocked?: boolean;
  };
  parentId: string | null;
  /** Le parent existe mais est masqué (compte bloqué, supprimé ou filtré). */
  parentUnavailable?: boolean;
  parentUnavailableReason?: 'blocked' | 'deleted' | 'unavailable' | string | null;
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
  /** Droits calculés par Go (threadgate, propriété, sourdine, blocage). */
  capabilities?: PostCapabilities;
  replies: WebThreadPost[];
  quotedExcerpt?: string | null;
  annotationQuote?: MappedQuotedAnnotation;
  articleQuote?: MappedQuotedArticle;
}

export function mapFeedPostToThreadThought(
  p: RawPostPayload | null | undefined
): WebThreadPost | null {
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
  const parentUnavailable = Boolean(p.parentUnavailable);

  return {
    id: p.id as string,
    content: (p.content as string) ?? '',
    authorId: (p.authorId as string) ?? (author.id as string) ?? '',
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
      // Sans ce champ, un compte média perdait son carré et redevenait un
      // cercle dès qu'il traversait un fil — l'avatar ne ment pas ailleurs.
      type: (author.type as 'PERSONAL' | 'MEDIA' | null | undefined) ?? null,
      isMuted: Boolean(author.isMuted),
      isBlocked: Boolean(author.isBlocked),
    },
    parentId: (p.parentId as string | null) ?? null,
    parentUnavailable,
    parentUnavailableReason:
      (p.parentUnavailableReason as WebThreadPost['parentUnavailableReason']) ?? null,
    rootId: (p.rootId as string | null) ?? null,
    repostId: (p.repostId as string | null) ?? null,
    // Garde de transport : un parent marqué indisponible ne traverse jamais,
    // même si un payload malformé fournit aussi son contenu.
    parent:
      !parentUnavailable && p.parent
        ? mapFeedPostToThreadThought(p.parent as RawPostPayload)
        : null,
    repost: p.repost ? mapFeedPostToThreadThought(p.repost as RawPostPayload) : null,
    likesCount,
    repliesCount,
    repostsCount,
    likeCount: likesCount,
    replyCount: repliesCount,
    repostCount: repostsCount,
    liked: Boolean(p.liked),
    reposted: Boolean(p.reposted),
    likes:
      (p.likes as Array<{ userId: string }>) ??
      (p.liked ? [{ userId: (author.id as string) || '' }] : []),
    _count: {
      likes: likesCount,
      replies: repliesCount,
      reposts: repostsCount,
    },
    attachments:
      (p.attachments as Array<{
        id?: string;
        url: string;
        type?: string;
        altText?: string | null;
      }>) ?? [],
    poll: (p.poll as WebThreadPost['poll']) ?? null,
    tags: (p.tags as string[]) ?? [],
    replyRestriction: (p.replyRestriction as string) ?? 'everyone',
    capabilities: (p.capabilities as PostCapabilities | undefined) ?? undefined,
    replies: [] as WebThreadPost[],
    quotedExcerpt: (p.quotedExcerpt as string | null | undefined) ?? null,
    annotationQuote: mapQuotedAnnotationForCard(
      p.quotedAnnotation as RawQuotedAnnotation | null | undefined
    ),
    articleQuote: mapQuotedArticleForCard(p.quotedArticle as RawQuotedArticle | null | undefined),
  };
}

export function buildThreadTree(
  rootPostId: string,
  flatReplies: RawPostPayload[]
): WebThreadPost[] {
  const nodesMap = new Map<string, WebThreadPost>();
  const directReplies: WebThreadPost[] = [];

  for (const r of flatReplies) {
    const node = mapFeedPostToThreadThought(r);
    if (node && typeof node.id === 'string') {
      nodesMap.set(node.id, node);
    }
  }

  for (const r of flatReplies) {
    const node = nodesMap.get(r.id as string);
    if (!node) continue;
    const parentId = node.parentId;
    // Un parent explicitement inaccessible ne doit jamais être rattaché,
    // même si un payload malformé contient encore le nœud parent.
    if (node.parentUnavailable) {
      node.parent = null;
      directReplies.push(node);
      continue;
    }
    if (!parentId || parentId === rootPostId) {
      directReplies.push(node);
    } else {
      const parentNode = nodesMap.get(parentId);
      if (parentNode && Array.isArray(parentNode.replies)) {
        parentNode.replies.push(node);
      } else {
        // Parent absent de la fermeture : on garde l'enfant, mais à la racine
        // avec le placeholder. Sans ce marquage, l'orphelin serait promu
        // silencieusement et deviendrait indiscernable d'une réponse directe.
        node.parent = null;
        node.parentUnavailable = true;
        node.parentUnavailableReason = node.parentUnavailableReason ?? 'unavailable';
        directReplies.push(node);
      }
    }
  }

  return directReplies;
}

export function mapGoThreadToWebThread(
  rawThread: RawPostPayload | null | undefined
): WebThreadPost | null {
  if (!rawThread) return null;
  const root = mapFeedPostToThreadThought(rawThread);
  if (!root) return null;
  const flatReplies = Array.isArray(rawThread.replies)
    ? (rawThread.replies as RawPostPayload[])
    : [];
  root.replies = buildThreadTree(root.id as string, flatReplies);
  return root;
}

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
    subdomain?: string | null;
    logoUrl: string | null;
    isCertified: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
    isMuted?: boolean;
    isBlocked?: boolean;
  };
  parentId?: string | null;
  repostId?: string | null;
  parent?: ProfilePostPayload | null;
  repost?: ProfilePostPayload | null;
  /** Le parent existe mais est masqué (compte bloqué, supprimé ou filtré). */
  parentUnavailable?: boolean;
  parentUnavailableReason?: 'blocked' | 'deleted' | 'unavailable' | string | null;
  /** Le profil est une vue du MÊME post : les citations y voyagent aussi. */
  quotedExcerpt?: string | null;
  annotationQuote?: MappedQuotedAnnotation;
  articleQuote?: MappedQuotedArticle;
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
  capabilities?: PostCapabilities;
}

export function mapProfilePost(fp: ApiFeedPost | RawPostPayload): ProfilePostPayload {
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
  const parentUnavailable = Boolean(raw.parentUnavailable);

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
      subdomain: (author.subdomain as string | null) ?? null,
      logoUrl: (author.logoUrl as string | null) ?? null,
      isCertified: Boolean(author.isCertified),
      type: (author.type as 'PERSONAL' | 'MEDIA' | null | undefined) ?? null,
      isMuted: Boolean(author.isMuted),
      isBlocked: Boolean(author.isBlocked),
    },
    parentId: (raw.parentId as string | null) ?? null,
    repostId: (raw.repostId as string | null) ?? null,
    parent: !parentUnavailable && raw.parent ? mapProfilePost(raw.parent as RawPostPayload) : null,
    repost: raw.repost ? mapProfilePost(raw.repost as RawPostPayload) : null,
    parentUnavailable,
    parentUnavailableReason:
      (raw.parentUnavailableReason as ProfilePostPayload['parentUnavailableReason']) ?? null,
    quotedExcerpt: (raw.quotedExcerpt as string | null | undefined) ?? null,
    annotationQuote: mapQuotedAnnotationForCard(
      raw.quotedAnnotation as RawQuotedAnnotation | null | undefined
    ),
    articleQuote: mapQuotedArticleForCard(raw.quotedArticle as RawQuotedArticle | null | undefined),
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
    capabilities: (raw.capabilities as PostCapabilities | undefined) ?? undefined,
  };
}

export function mapProfileSlice(slice: ApiFeedSlice): ProfilePostPayload {
  const base = mapProfilePost(slice.targetPost);
  // Parent masqué : la slice le signale sans jamais envoyer son contenu. On
  // coupe aussi le parent éventuellement présent dans le targetPost ou la
  // slice : la réponse ne doit transporter aucun champ du compte bloqué.
  if (slice.parentUnavailable || base.parentUnavailable) {
    base.parent = null;
    base.parentUnavailable = true;
    base.parentUnavailableReason =
      slice.parentUnavailableReason ?? base.parentUnavailableReason ?? 'unavailable';
  } else if (!base.parent && slice.parentPost) {
    // Contexte de réponse absent du targetPost → on l'attache depuis la slice.
    base.parent = mapProfilePost(slice.parentPost);
  }
  return base;
}
