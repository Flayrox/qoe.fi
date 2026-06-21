// =====================================================================
// 🔢 CONSTANTES MÉTIER — Partagées par toutes les apps/packages
// =====================================================================

/**
 * 👥 Rôles utilisateurs.
 * Hiérarchie : superadmin > creator > user
 */
export const ROLES = {
  USER: "user",
  CREATOR: "creator",
  SUPERADMIN: "superadmin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * 📊 Hiérarchie des rôles (pour les checks de permission).
 * Un superadmin a accès à tout ce qu'un creator peut faire, etc.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.USER]: 1,
  [ROLES.CREATOR]: 2,
  [ROLES.SUPERADMIN]: 3,
};

/**
 * 🎨 Styles de layout pour les tenants (pages publiques créateur).
 */
export const TENANT_LAYOUTS = {
  MINIMAL: "minimal",
  MAGAZINE: "magazine",
  BRUTALIST: "brutalist",
} as const;

export type TenantLayout = (typeof TENANT_LAYOUTS)[keyof typeof TENANT_LAYOUTS];

/**
 * 🌗 Modes de thème.
 */
export const THEME_MODES = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

export type ThemeMode = (typeof THEME_MODES)[keyof typeof THEME_MODES];

/**
 * 📝 Visibilités des micro-posts.
 */
export const POST_VISIBILITY = {
  PUBLIC: "public",
  FOLLOWERS: "followers",
  PRIVATE: "private",
} as const;

export type PostVisibility = (typeof POST_VISIBILITY)[keyof typeof POST_VISIBILITY];

/**
 * 💰 Types de transactions wallet.
 */
export const WALLET_TRANSACTION_TYPES = {
  DEPOSIT: "DEPOSIT",
  SUBSCRIPTION_PAYMENT: "SUBSCRIPTION_PAYMENT",
  WITHDRAWAL: "WITHDRAWAL",
  REFUND: "REFUND",
} as const;

export type WalletTransactionType =
  (typeof WALLET_TRANSACTION_TYPES)[keyof typeof WALLET_TRANSACTION_TYPES];

/**
 * 📏 Limites métier (garde-fous).
 */
export const LIMITS = {
  // Articles
  MAX_ARTICLES_PER_CREATOR: 10_000,
  MAX_ARTICLE_LENGTH: 500_000, // caractères
  // Posts
  MAX_POST_LENGTH: 10_000,
  MAX_TAGS_PER_POST: 10,
  // Follows
  MAX_FOLLOWING: 5_000,
  // Subscribers
  MAX_SUBSCRIBERS_PER_CREATOR: 1_000_000,
  // Uploads
  MAX_UPLOAD_SIZE_MB: 10,
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * 🌐 URLs canoniques (utilisées pour les redirects, emails, etc.)
 */
export const URLS = {
  APP: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  CONSOLE: process.env.NEXT_PUBLIC_CONSOLE_URL || "http://localhost:3000",
  ADMIN: process.env.NEXT_PUBLIC_ADMIN_URL || "http://admin.localhost",
  DASHBOARD: process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://dashboard.localhost",
  API: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  LANDING: process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3000/start",
} as const;

/**
 * 🌍 Langues supportées.
 */
export const LANGUAGES = {
  EN: "en",
  FR: "fr",
} as const;

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES];

export const ALL_LANGUAGES: Language[] = Object.values(LANGUAGES);
export const DEFAULT_LANGUAGE: Language = LANGUAGES.FR;
