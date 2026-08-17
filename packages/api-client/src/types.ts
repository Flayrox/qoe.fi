// =====================================================================
// 🧬 types.ts — Contrats de données partagés (web + mobile)
// =====================================================================
// Source de vérité pour les shapes échangés entre le client et l'API.
// - `ApiResponse<T>` : enveloppe générique paginée (utilisée par le feed,
//   les listes de notifications, etc.) — consommée par `useInfiniteFeed`.
// - `ThoughtData` : shape d'une « pensée » (post court) telle que servie par
//   l'API Go (`/v1/feed`, `/v1/thoughts`) et rendue par le mobile
//   (apps/mobile/src/features/feed/thought-card.tsx).
// ⚠️ Toute évolution de la réponse Go doit se refléter ici pour rester
//    type-safe bout-en-bout (Prisma → Go → client → mobile).
//
// ⚠️ L'API Go renvoie des **FeedSlice** (avec targetPost imbriqué) sur le
//    feed, et des **Thought** (avec viewerLiked/viewerReposted) sur les
//    endpoints posts. Les deux shapes sont documentées ci-dessous — voir
//    docs/API_CONTRACT.md §8 pour les gaps à corriger.
// =====================================================================

export type ApiResponse<T> = {
  success?: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta: {
    page?: number;
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
};

// ─────────────────────────────────────────────────────────────────────
// Feed (shapes exactes de l'API Go — apps/api-go/internal/modules)
// ─────────────────────────────────────────────────────────────────────

/** Auteur dénormalisé d'une pensée (shape Go `Author`). */
export interface FeedAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
}

/** Pièce jointe d'une pensée (shape Go `Attachment`). */
export interface FeedAttachment {
  id: string;
  thoughtId: string;
  type: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  order: number;
}

/** Option de sondage avec score calculé. */
export interface FeedPollOption {
  id: string;
  text: string;
  order: number;
  voteCount: number;
  percentage: number;
}

/** Sondage formaté (miroir de formatPollData TS / Go `Poll`). */
export interface FeedPoll {
  id: string;
  thoughtId: string;
  expiresAt: string;
  isExpired: boolean;
  totalVotes: number;
  userVotedOptionId: string | null;
  options: FeedPollOption[];
}

/** Compteurs (`_count` de Prisma). */
export interface FeedCounts {
  likes: number;
  replies: number;
  reposts: number;
}

/**
 * Pensée complète telle que servie dans le feed (shape Go `FeedPost`).
 * ⚠️ `liked`/`reposted` = état du viewer ; `author` n'a PAS de subdomain.
 */
export interface FeedPost {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  tags: string[];
  imageUrl: string | null;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  parentId: string | null;
  rootId: string | null;
  repostId: string | null;
  replyRestriction: string;
  isPinned: boolean;
  isHiddenByAuthor: boolean;
  author: FeedAuthor;
  parent: FeedPost | null;
  repost: FeedPost | null;
  attachments: FeedAttachment[];
  poll: FeedPoll | null;
  likes: Array<{ userId: string }>;
  reposts: Array<{ id: string; userId: string }>;
  _count: FeedCounts;
  liked: boolean;
  reposted: boolean;
}

/**
 * Élément du feed : une « slice » de conversation (miroir de FeedSlice TS
 * et de buildFeedSlices). C'est CE QUE RENVOIE réellement `/v1/feed`.
 */
export interface FeedSlice {
  id: string;
  rootPost: FeedPost | null;
  parentPost: FeedPost | null;
  targetPost: FeedPost;
  isIncompleteThread: boolean;
  hiddenIntermediateCount: number;
}

/** Réponse paginée du feed (shape Go `FeedResult`). */
export interface FeedResult {
  items: FeedSlice[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Shape `Thought` de l'API Go (GET /v1/posts/{id}, POST /v1/posts...).
 * ⚠️ Utilise `viewerLiked`/`viewerReposted` (≠ FeedPost.liked/reposted).
 */
export interface Thought {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  tags: string[];
  imageUrl: string | null;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  parentId: string | null;
  rootId: string | null;
  repostId: string | null;
  replyRestriction: string;
  isPinned: boolean;
  isHiddenByAuthor: boolean;
  author: FeedAuthor;
  viewerLiked: boolean;
  viewerReposted: boolean;
}

/** Fil de discussion : pensée cible + réponses (shape Go `ThreadPost`). */
export type ThreadData = FeedPost & { replies: FeedPost[] };

// ─────────────────────────────────────────────────────────────────────
// Profils (shape Go /v1/users/me et /v1/users/{username})
// ─────────────────────────────────────────────────────────────────────

/** Profil courant (GET /v1/users/me) — enveloppé `data`. */
export interface MyProfileData {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  isCertified: boolean;
  isShadowbanned: boolean;
  isSuspended: boolean;
  suspendReason: string | null;
  forceStandardTheme: boolean;
  onboardingText: string | null;
  logoUrl: string | null;
  publicationId: string | null;
  advancedSettingsMode: boolean;
  hasCompletedOnboarding: boolean;
  apiAccessStatus: string;
  apiApplicationReason: string | null;
  walletBalanceCents: number;
  createdAt: string;
  updatedAt: string;
  stats: { followingCount: number; followersCount: number };
}

/** Profil public d'une publication (GET /v1/users/{username}). */
export interface PublicProfileData {
  id: string;
  name: string | null;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  heroText: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  isCertified: boolean;
  isFollowing: boolean;
  createdAt: string;
  type: 'PERSONAL' | 'MEDIA';
  _count: { followers: number; articles: number };
}

// ─────────────────────────────────────────────────────────────────────
// Articles (shape Go lecture publique /v1/articles/{slug})
// ─────────────────────────────────────────────────────────────────────

/** Article lu publiquement (paywall tronqué côté serveur). */
export interface ArticleData {
  id: string;
  title: string;
  slug: string;
  content: string;
  isTruncated: boolean;
  accessGranted: boolean;
  visibility: 'PUBLIC' | 'MEMBERS_ONLY' | 'PAID_SUBSCRIBERS' | 'TIER_SPECIFIC';
  readingTime: number;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
  paywallMeta: unknown | null;
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; name: string | null; username: string | null; logoUrl: string | null };
  publication: {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────
// Highlights & annotations (shape Go /v1/articles/{id}/highlights)
// ─────────────────────────────────────────────────────────────────────

/** Auteur d'un surlignage ou d'un commentaire d'annotation. */
export interface HighlightAuthor {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
}

/** Surlignage d'article (shape Go `Highlight`). */
export interface Highlight {
  id: string;
  text: string;
  note: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  readerId: string;
  articleId: string;
  createdAt: string;
  reader: HighlightAuthor;
  viewerUpvoted: boolean;
  commentsCount: number;
}

/** Commentaire d'annotation attaché à un surlignage. */
export interface AnnotationComment {
  id: string;
  content: string;
  createdAt: string;
  highlightId: string;
  author: HighlightAuthor;
}

/** Surlignage du lecteur avec l'article associé (bibliothèque). */
export interface MyHighlight {
  id: string;
  text: string;
  note: string | null;
  isPublic: boolean;
  isOfficial: boolean;
  upvotesCount: number;
  readerId: string;
  articleId: string;
  createdAt: string;
  articleTitle: string;
  articleSlug: string;
  publicationId: string;
  publicationName: string;
  publicationSlug: string;
}

/** Article du feed mobile (shape Go `FeedArticle` — miroir ArticleCard web). */
export interface FeedArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
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
    isCertified: boolean;
  };
  publication: {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    logoUrl: string | null;
    type: string;
  };
  category: { id: string; name: string; slug: string } | null;
}

/** Réponse paginée du feed d'articles (shape Go `ArticleFeedResult`). */
export interface ArticleFeedResult {
  items: FeedArticle[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Article sauvegardé (bibliothèque, shape Go `BookmarkItem`). */
export interface BookmarkItem {
  bookmarkId: string;
  bookmarkedAt: string;
  articleId: string;
  articleTitle: string;
  articleSlug: string;
  readingTime: number;
  isPremium: boolean;
  articleCreatedAt: string;
  publicationId: string;
  publicationName: string;
  publicationSlug: string;
  subdomain: string | null;
  author: HighlightAuthor;
}

// ─────────────────────────────────────────────────────────────────────
// Notifications (shape Go /v1/notifications)
// ─────────────────────────────────────────────────────────────────────

export interface NotificationSender {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
}

export interface NotificationThoughtRef {
  id: string;
  content: string;
  createdAt: string;
}

export interface NotificationArticleRef {
  id: string;
  title: string;
  slug: string;
}

export type NotificationType =
  | 'LIKE'
  | 'REPLY'
  | 'REPOST'
  | 'FOLLOW'
  | 'MENTION'
  | 'COMMENT'
  | 'MEDIA_INVITE'
  | 'MEDIA_MEMBER_JOINED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  thoughtId: string | null;
  articleId: string | null;
  thought: NotificationThoughtRef | null;
  article: NotificationArticleRef | null;
  senders: NotificationSender[];
  totalCount: number;
}

export interface NotificationResult {
  notifications: AppNotification[];
  nextCursor: string;
}

// ─────────────────────────────────────────────────────────────────────
// Legacy (web) — conservé pour compatibilité
// ─────────────────────────────────────────────────────────────────────

export interface ThoughtData {
  /** ID UUID de la pensée (canonical id ; un repost pointe vers la pensée d'origine). */
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    name: string | null;
    subdomain: string | null;
    customDomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  liked?: boolean;
  isLiked?: boolean;
  reposted?: boolean;
  isReposted?: boolean;
  triggerWarning?: string | null;
  imageUrl?: string | null;
}
