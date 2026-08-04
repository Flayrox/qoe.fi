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

export type MonorepoApp = "feed" | "dashboard" | "admin" | "landing" | "api" | "tenant";

export function getMonorepoUrl(app: MonorepoApp, hostname?: string, tenantSubdomain?: string): string {
  // 1. Mode Production
  if (process.env.NODE_ENV === "production") {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "qoe.fi";
    switch (app) {
      case "feed": return `https://${rootDomain}`;
      case "dashboard": return `https://dashboard.${rootDomain}`;
      case "admin": return `https://admin.${rootDomain}`;
      case "landing": return `https://start.${rootDomain}`;
      case "api": return `https://api.${rootDomain}`;
      case "tenant": return `https://${tenantSubdomain || "demo"}.${rootDomain}`;
    }
  }

  // 2. Mode Développement (Détection dynamique lvh.me vs qoe.test + conservation des ports)
  let devBase = "lvh.me";
  if (hostname && hostname.endsWith("qoe.test")) {
    devBase = "qoe.test";
  }

  // Si l'hôte n'a pas de port (ex: Caddy proxy sur port 80), on n'ajoute pas de port
  const isCaddy = hostname && !hostname.includes(":");
  const feedPort = isCaddy ? "" : ":3010";
  const dashboardPort = isCaddy ? "" : ":3020";
  const adminPort = isCaddy ? "" : ":3030";
  const landingPort = isCaddy ? "" : ":3040";
  const apiPort = isCaddy ? "" : ":3002";
  const tenantPort = isCaddy ? "" : ":3001";

  switch (app) {
    case "feed": return `http://${devBase}${feedPort}`;
    case "dashboard": return `http://dashboard.${devBase}${dashboardPort}`;
    case "admin": return `http://admin.${devBase}${adminPort}`;
    case "landing": return `http://start.${devBase}${landingPort}`;
    case "api": return `http://api.${devBase}${apiPort}`;
    case "tenant": return `http://${tenantSubdomain || "climat"}.${devBase}${tenantPort}`;
  }
}

export const URLS = {
  get APP(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("feed", hostname);
  },
  get CONSOLE(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("feed", hostname);
  },
  get ADMIN(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("admin", hostname);
  },
  get DASHBOARD(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("dashboard", hostname);
  },
  get API(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("api", hostname);
  },
  get LANDING(): string {
    const win = (globalThis as Record<string, unknown>).window as { location: { hostname: string; port: string; protocol: string } } | undefined;
    const hostname = win ? `${win.location.hostname}${win.location.port ? `:${win.location.port}` : ""}` : undefined;
    return getMonorepoUrl("landing", hostname);
  },
};

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
