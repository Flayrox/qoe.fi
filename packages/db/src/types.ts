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
  UserRole,
} from "@prisma/client";

export { ROLES } from "@qoe/config";
