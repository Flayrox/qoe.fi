// =====================================================================
// 📘 Types Prisma — Ré-exports
// =====================================================================
// 📖 Évite d'importer directement @prisma/client dans les apps/packages.
//    Si demain on change de provider (ex: Drizzle), on change juste ici.
// =====================================================================

import type { Thought as PrismaThought } from '@prisma/client';

export { ContentVisibility, PublicationType } from '@prisma/client';
export type {
  User,
  Publication,
  Media,
  MediaMember,
  MediaInvite,
  MediaAuditLog,
  Article,
  Thought,
  Subscriber,
  Follows,
  Bookmark,
  Highlight,
  Letter,
  Category,
  NavigationItem,
  SocialLink,
  WalletTransaction,
  MutedWord,
  BlockedUser,
  Trend,
  PartnerPromo,
  SystemConfig,
  Like,
  Prisma,
} from '@prisma/client';

/** @deprecated Utiliser Thought */
export type Post = PrismaThought;

export { ROLES } from '@qoe/config';

// =====================================================================
// 📦 DTOs MÉTIER CANONIQUES (Silicon Valley Standard)
// =====================================================================

/**
 * 📰 DTO Publication (identité brand polymorphe : personnel OU média)
 */
export interface PublicationDTO {
  id: string;
  type: 'PERSONAL' | 'MEDIA';
  name: string | null;
  slug: string;
  username: string | null; // Alias de slug (compat feed)
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  bio?: string | null;
  isCertified?: boolean;
}

/**
 * 👤 DTO Profil Créateur / Auteur — désormais une Publication brand.
 * `authorName` = le nom de l'auteur humain (byline "Par Sophie • Médium").
 */
export interface CreatorProfileDTO {
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
}

/**
 * 📚 DTO Article de Feed
 */
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
  author: CreatorProfileDTO;
  category: { name: string } | null;
  tags?: string[];
  likesCount?: number;
  repliesCount?: number;
  liked?: boolean;
}

/**
 * 💬 DTO Thought / Feed Item
 */
export interface FeedPostDTO {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: Date | string;
  triggerWarning?: string | null;
  isPinned?: boolean;
  replyRestriction?: string;
  tags?: string[];
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  liked?: boolean;
  isLiked?: boolean;
  reposted?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
  author: CreatorProfileDTO;
}

/** 💬 Alias DDD Canonique pour FeedPostDTO */
export type FeedThoughtDTO = FeedPostDTO;

/**
 * 📊 Enveloppe Réponse API Standardisée
 */
export interface ApiResponse<T> {
  data: T;
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * ⚡ Protocole Universal Server Action Result
 */
export type ActionResult<T = unknown> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
