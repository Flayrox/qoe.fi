// =====================================================================
// 🧠 Types du feed — version locale (core, Go-only)
// =====================================================================
// Structures du fil de pensées / articles telles que renvoyées par l'API Go
// (GET /v1/feed/hydrate, /v1/home/feed) — parité avec les shapes Prisma
// historiques. Porté depuis packages/db (types.ts + repositories/posts.ts).
// =====================================================================

export interface FeedAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
}

export interface FeedPublication {
  id: string;
  type: 'PERSONAL' | 'MEDIA';
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified: boolean;
}

export interface FeedPoll {
  id: string;
  thoughtId: string;
  expiresAt: Date | string;
  options?: Array<{
    id: string;
    text: string;
    order: number;
    _count?: { votes: number };
  }>;
  votes?: Array<{ optionId: string; userId: string }>;
}

export interface FormattedPoll {
  id: string;
  thoughtId: string;
  expiresAt: Date | string;
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

export function formatPollData(
  rawPoll: FeedPoll | null | undefined,
  currentUserId?: string | null
): FormattedPoll | null {
  if (!rawPoll) return null;
  const totalVotes = rawPoll.options
    ? rawPoll.options.reduce((acc: number, opt) => acc + (opt._count?.votes || 0), 0)
    : 0;
  const isExpired = new Date() > new Date(rawPoll.expiresAt);
  const userVote =
    currentUserId && Array.isArray(rawPoll.votes)
      ? rawPoll.votes.find((v) => v.userId === currentUserId)
      : null;

  const options = (rawPoll.options || []).map((opt) => {
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

// FeedPost est une pensée du fil (poll déjà formaté). Les dates arrivent en
// string RFC3339 depuis le JSON Go (ou en Date côté Prisma fallback).
export interface FeedPost {
  id: string;
  content: string;
  imageUrl: string | null;
  createdAt: Date | string;
  tags?: string[];
  author: FeedAuthor;
  parent?: {
    id: string;
    content: string | null;
    createdAt: Date | string;
    author: FeedAuthor;
  } | null;
  repost?: FeedPost | null;
  quotedExcerpt?: string | null;
  quotedArticle?: {
    id: string;
    title: string;
    slug: string;
    content?: string | null;
    isPremium: boolean;
    // Contexte du passage résolu par le serveur (texte canonique) — fini le
    // strip HTML + indexOf côté client.
    quoteContext?: {
      before: string;
      highlight: string;
      after: string;
      start: number;
      end: number;
      sha: string;
    } | null;
    publication: FeedPublication;
    author: FeedAuthor;
  } | null;
  likes?: { userId: string }[];
  reposts?: { id: string; authorId?: string; content?: string | null }[];
  _count?: { likes: number; replies: number; reposts: number };
  poll: FormattedPoll | null;
}

export interface FeedSlice {
  id: string;
  rootPost?: FeedPost | null;
  parentPost?: FeedPost | null;
  targetPost: FeedPost;
  isIncompleteThread: boolean;
  hiddenIntermediateCount?: number;
}

export interface FeedAttribution {
  user: FeedAuthor;
  role: string;
  order: number;
  isVisible: boolean;
  consentStatus: string;
}

// Article du feed tel que renvoyé par le JSON Go (hydrate / home/feed).
export interface FeedArticle {
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
  createdAt: string | Date;
  updatedAt: string | Date;
  author: FeedAuthor;
  publication: FeedPublication;
  coAuthors: FeedAuthor[];
  attributions: FeedAttribution[];
  category: { name: string } | null;
  likes?: { userId: string }[];
  _count?: { likes: number; replies: number; reposts: number };
}

// 📚 DTO Article de Feed (composants — parité packages/db FeedArticleDTO).
export interface FeedJournalist {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  role?: string;
  order?: number;
  isVisible?: boolean;
  consentStatus?: string;
}

export interface FeedArticleDTO {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain: string | null;
    customDomain: string | null;
    logoUrl: string | null;
    heroText: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA';
    authorName?: string | null;
    journalist?: FeedJournalist | null;
    coAuthors?: FeedJournalist[];
    contributors?: FeedJournalist[];
  };
  category: { name: string } | null;
  tags?: string[];
  contributors?: FeedJournalist[];
  likesCount?: number;
  repliesCount?: number;
  liked?: boolean;
}
