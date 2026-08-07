// =====================================================================
// 📘 Types Prisma — Ré-exports
// =====================================================================
// 📖 Évite d'importer directement @prisma/client dans les apps/packages.
//    Si demain on change de provider (ex: Drizzle), on change juste ici.
// =====================================================================

export type {
  User,
  Article,
  Post,
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

export { ROLES } from "@qoe/config";

// =====================================================================
// 📦 DTOs MÉTIER CANONIQUES (Silicon Valley Standard)
// =====================================================================
// 📖 Évite la duplication d'interfaces ad-hoc dans les composants UI.
//    Permet une inférence 100% type-safe et synchronisée avec Prisma.
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
 * 💬 DTO Micro-Post / Feed Item
 */
export interface FeedPostDTO {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: Date | string;
  triggerWarning?: string | null;
  isPinned?: boolean;
  tags?: string[];
  _count?: { likes?: number; replies?: number; reposts?: number };
  author: CreatorProfileDTO;
}

/**
 * ⚡ Protocole Universal Server Action Result
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
