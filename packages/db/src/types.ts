// =====================================================================
// 📘 Types Prisma — Ré-exports
// =====================================================================
// 📖 Évite d'importer directement @prisma/client dans les apps/packages.
//    Si demain on change de provider (ex: Drizzle), on change juste ici.
// =====================================================================

import type { Thought as PrismaThought } from "@prisma/client";

export type {
  User,
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
} from "@prisma/client";

/** @deprecated Utiliser Thought */
export type Post = PrismaThought;

export { ROLES } from "@qoe/config";

// =====================================================================
// 📦 DTOs MÉTIER CANONIQUES (Silicon Valley Standard)
// =====================================================================

/**
 * 👤 DTO Profil Créateur / Auteur
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
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
