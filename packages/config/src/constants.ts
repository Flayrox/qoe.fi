// =====================================================================
// 🔢 CONSTANTES MÉTIER — Partagées par toutes les apps/packages
// =====================================================================

import { resolveAppUrl, type AppService } from './domain-hub';

/**
 * Documentation API : site statique hors monorepo, servi en production.
 * Aucune app `docs` ici, donc pas de résolution par hôte.
 */
const DOCS_URL = 'https://docs.qoe.fi';

/**
 * 👥 Rôles utilisateurs.
 * Hiérarchie : superadmin > creator > user
 */
export const ROLES = {
  USER: 'user',
  CREATOR: 'creator',
  SUPERADMIN: 'superadmin',
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
  MINIMAL: 'minimal',
  MAGAZINE: 'magazine',
  BRUTALIST: 'brutalist',
} as const;

export type TenantLayout = (typeof TENANT_LAYOUTS)[keyof typeof TENANT_LAYOUTS];

/**
 * 🌗 Modes de thème.
 */
export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemeMode = (typeof THEME_MODES)[keyof typeof THEME_MODES];

/**
 * 📝 Visibilités des micro-posts.
 */
export const POST_VISIBILITY = {
  PUBLIC: 'public',
  FOLLOWERS: 'followers',
  PRIVATE: 'private',
} as const;

export type PostVisibility = (typeof POST_VISIBILITY)[keyof typeof POST_VISIBILITY];

/**
 * 🔓 Visibilité de contenu des articles (paywall) — ex-enum Prisma
 * `ContentVisibility`, désormais const locale sans dépendance Prisma.
 */
export const ContentVisibility = {
  PUBLIC: 'PUBLIC',
  MEMBERS_ONLY: 'MEMBERS_ONLY',
  PAID_SUBSCRIBERS: 'PAID_SUBSCRIBERS',
  TIER_SPECIFIC: 'TIER_SPECIFIC',
} as const;

export type ContentVisibility = (typeof ContentVisibility)[keyof typeof ContentVisibility];

/**
 * 💰 Types de transactions wallet.
 */
export const WALLET_TRANSACTION_TYPES = {
  DEPOSIT: 'DEPOSIT',
  SUBSCRIPTION_PAYMENT: 'SUBSCRIPTION_PAYMENT',
  WITHDRAWAL: 'WITHDRAWAL',
  REFUND: 'REFUND',
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

export type MonorepoApp =
  'feed' | 'dashboard' | 'studio' | 'admin' | 'landing' | 'api' | 'tenant' | 'docs';

/** Application du monorepo → service du Domain Hub (source unique des origines). */
const MONOREPO_SERVICES = {
  feed: 'app',
  dashboard: 'studio',
  studio: 'studio',
  admin: 'admin',
  landing: 'landing',
  api: 'api',
  tenant: 'tenant',
} as const satisfies Record<Exclude<MonorepoApp, 'docs'>, AppService>;

export function getMonorepoUrl(
  app: MonorepoApp,
  hostname?: string,
  tenantSubdomain?: string
): string {
  // F158 — cette fonction recopiait la table des ports, des sous-domaines de
  // production et la détection d'environnement de `domain-hub`, et en avait
  // déjà divergé : la vitrine était servie sur `start.<domaine>` (aucune route)
  // alors que `apps/hi` répond à la racine de son port. Une seule résolution
  // désormais : `resolveAppUrl`.
  if (app === 'docs') return DOCS_URL;

  if (app === 'tenant') {
    return resolveAppUrl('tenant', hostname, { subdomain: tenantSubdomain || 'demo' });
  }

  return resolveAppUrl(MONOREPO_SERVICES[app], hostname);
}

export const URLS = {
  get APP(): string {
    return getMonorepoUrl('feed');
  },
  get APP_HOME(): string {
    return `${getMonorepoUrl('feed')}/home`;
  },
  get CONSOLE(): string {
    return getMonorepoUrl('feed');
  },
  get ADMIN(): string {
    return getMonorepoUrl('admin');
  },
  get STUDIO(): string {
    return getMonorepoUrl('studio');
  },
  /** @deprecated Utiliser `URLS.STUDIO` */
  get DASHBOARD(): string {
    return getMonorepoUrl('studio');
  },
  get API(): string {
    return getMonorepoUrl('api');
  },
  get LANDING(): string {
    return getMonorepoUrl('landing');
  },
  get DOCS(): string {
    return getMonorepoUrl('docs');
  },
};

/**
 * 🌍 Langues supportées.
 */
export const LANGUAGES = {
  EN: 'en',
  FR: 'fr',
} as const;

export type Language = (typeof LANGUAGES)[keyof typeof LANGUAGES];

export const ALL_LANGUAGES: Language[] = Object.values(LANGUAGES);
export const DEFAULT_LANGUAGE: Language = LANGUAGES.FR;
