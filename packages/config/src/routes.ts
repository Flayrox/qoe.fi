// =====================================================================
// 🗺️ REGISTRE DE ROUTES TYPE-SAFE — qoefi (Silicon Valley Standard)
// =====================================================================
// 📖 Permet de construire TOUTES les URLs du monorepo sans aucune
//    chaîne de caractères hardcodée.
//    Rendu 100% type-safe, autocomplété et incassable au refactoring.
// =====================================================================

import { getMonorepoUrl } from './constants';
import { getMainAppUrl, isMainAppHost } from './domain-hub';

const studioRoutes = {
  home: () => '/',
  articles: {
    list: () => '/articles',
    new: () => '/articles/new',
    edit: (id: string) => `/articles/${encodeURIComponent(id)}`,
  },
  analytics: () => '/analytics',
  audience: () => '/audience',
  newsletters: () => '/newsletters',
  settings: () => '/settings',
  developer: () => '/developer',
  onboarding: () => '/onboarding',
  media: () => '/media',
  notifications: () => '/notifications',
  pricing: () => '/pricing',
  import: () => '/import',
} as const;

export const routes = {
  /** 📖 Reader Core App (`apps/core`) */
  feed: {
    home: () => '/home',
    login: (options?: { signup?: boolean; redirect?: string }) => {
      const params = new URLSearchParams();
      if (options?.signup) params.set('signup', 'true');
      if (options?.redirect) params.set('redirect', options.redirect);
      const query = params.toString();
      return query ? `/login?${query}` : '/login';
    },
    register: () => '/register',
    library: (tab?: 'bookmarks' | 'highlights' | 'annotations') =>
      tab ? `/library?tab=${tab}` : '/library',
    highlights: () => '/library?tab=highlights',
    /** EPUBs personnels (fiche Plus P1) : ma bibliothèque de livres. */
    ebooks: () => '/library/ebooks',
    ebook: (id: string) => `/library/ebooks/${encodeURIComponent(id)}`,
    billing: () => '/billing',
    pricing: () => '/pricing',
    settings: () => '/settings',
    onboarding: () => '/onboarding',
    profile: (
      username: string,
      tab?:
        'thoughts' | 'with_replies' | 'articles' | 'reposts' | 'media' | 'followers' | 'following'
    ) => {
      const clean = encodeURIComponent(username.replace(/^@/, ''));
      if (!tab || tab === 'thoughts') return `/${clean}`;
      return `/${clean}/${tab}`;
    },
    article: (ownerOrSlug: string, articleSlug?: string) => {
      if (articleSlug) {
        return `/${encodeURIComponent(ownerOrSlug.replace(/^@/, ''))}/a/${encodeURIComponent(articleSlug)}`;
      }
      return `/a/${encodeURIComponent(ownerOrSlug)}`;
    },
    shortArticle: (shortCode: string) => `/l/${encodeURIComponent(shortCode)}`,
    thought: (username: string, id: string) =>
      `/${encodeURIComponent(username.replace(/^@/, ''))}/thought/${encodeURIComponent(id)}`,
    notifications: () => '/notifications',
    messages: (id?: string) => (id ? '/messages/' + encodeURIComponent(id) : '/messages'),
    search: () => '/search',
    legal: (slug?: string) => (slug ? `/legal/${encodeURIComponent(slug)}` : '/legal'),
  },

  /** 🎨 Creator Studio App (`apps/studio`) */
  studio: studioRoutes,
  /** @deprecated Utiliser `routes.studio` */
  dashboard: studioRoutes,

  /** 🛡️ Superadmin Dashboard App (`apps/admin`) */
  admin: {
    home: () => '/admin',
    work: () => '/admin/work',
    health: () => '/admin/health',
    system: () => '/admin/system',
    users: {
      list: () => '/admin/users',
      detail: (id: string) => `/admin/users/${encodeURIComponent(id)}`,
    },
    reports: () => '/admin/reports',
    abuse: () => '/admin/abuse',
    appeals: () => '/admin/appeals',
    incidents: () => '/admin/incidents',
    support: {
      list: () => '/admin/support',
      articles: () => '/admin/support/articles',
    },
    subscriptions: () => '/admin/subscriptions',
    imports: () => '/admin/imports',
    campaigns: () => '/admin/campaigns',
    widgets: () => '/admin/widgets',
    notifications: () => '/admin/notifications',
    storage: () => '/admin/storage',
    retention: () => '/admin/retention',
    config: () => '/admin/config',
    frontend: () => '/admin/frontend',
    translations: () => '/admin/translations',
    api: () => '/admin/api',
    oauth: () => '/admin/oauth',
    features: () => '/admin/features',
    settings: () => '/admin/settings',
    sandbox: () => '/admin/sandbox',
    legal: () => '/admin/legal',
    approvals: () => '/admin/approvals',
    compliance: () => '/admin/compliance',
    audit: () => '/admin/audit',
    access: {
      list: () => '/admin/access',
      roles: () => '/admin/access/roles',
      decisions: () => '/admin/access/decisions',
    },
  },

  /** 📱 Application Expo (routes expo-router, hrefs web inclus). */
  mobile: {
    feed: () => '/',
    explore: () => '/explore',
    notifications: () => '/notifications',
    messages: () => '/messages',
    profile: () => '/profile',
    user: () => '/user/[username]' as const,
    library: () => '/library',
    history: () => '/history',
    wallet: () => '/wallet',
    settings: () => '/settings',
  },

  /** 🌐 Page d'exposition Hi (`apps/hi`) */
  landing: {
    home: () => '/',
    support: () => '/support',
    legal: (slug?: string) => (slug ? `/legal/${encodeURIComponent(slug)}` : '/legal'),
  },

  /** 🌐 Multi-Tenant Creator Sites (`apps/tenants`) */
  tenant: {
    home: (subdomain: string, host?: string) => `${getMonorepoUrl('tenant', host, subdomain)}/`,
    article: (subdomain: string, slug: string, host?: string, categorySlug?: string | null) =>
      categorySlug
        ? `${getMonorepoUrl('tenant', host, subdomain)}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`
        : `${getMonorepoUrl('tenant', host, subdomain)}/article/${encodeURIComponent(slug)}`,
    articleLegacy: (subdomain: string, slug: string, host?: string) =>
      `${getMonorepoUrl('tenant', host, subdomain)}/article/${encodeURIComponent(slug)}`,
    shortArticle: (subdomain: string, shortCode: string, host?: string) =>
      `${getMonorepoUrl('tenant', host, subdomain)}/l/${encodeURIComponent(shortCode)}`,
  },
} as const;

export type AppRoutes = typeof routes;

/** Shape minimale pour résoudre l'URL canonique d'un article */
export interface ArticleResolvable {
  slug: string;
  shortCode?: string | null;
  author?: {
    username?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    name?: string | null;
    journalist?: {
      username?: string | null;
      id?: string;
    } | null;
  } | null;
  publisher?: {
    slug?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    name?: string | null;
  } | null;
  category?: {
    slug?: string | null;
    name?: string | null;
  } | null;
  authorUsername?: string | null;
  owner?: string | null;
}

/**
 * Détermine le propriétaire canonique d'un article (Média prioritaire, sinon créateur, sinon fallback).
 */
export function getArticleOwner(article: ArticleResolvable, fallbackOwner?: string): string {
  return (
    article.publisher?.slug ||
    article.publisher?.subdomain ||
    article.author?.username ||
    article.author?.subdomain ||
    article.author?.journalist?.username ||
    article.authorUsername ||
    article.owner ||
    fallbackOwner ||
    'article'
  );
}

function getClientHost(): string | undefined {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    const win = (globalThis as { window?: { location?: { host?: string } } }).window;
    return win?.location?.host;
  }
  return undefined;
}

function buildCustomDomainArticlePath(slug: string, categorySlug?: string | null): string {
  return categorySlug
    ? `/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`
    : `/article/${encodeURIComponent(slug)}`;
}

/**
 * Génère l'URL d'un article (format feed /:owner/:slug ou format tenant multi-domaine).
 * S'adapte au contexte d'exécution (génère une URL absolue inter-applications si
 * appelée hors de apps/core, ou si options.absolute est activé).
 */
export function getArticleUrl(
  article: ArticleResolvable,
  options?: {
    preferTenant?: boolean;
    fallbackOwner?: string;
    host?: string;
    absolute?: boolean;
  }
): string {
  if (options?.preferTenant) {
    const customDomain = article.publisher?.customDomain || article.author?.customDomain;
    if (customDomain) {
      return `https://${customDomain}${buildCustomDomainArticlePath(article.slug, article.category?.slug)}`;
    }
    if (article.publisher?.subdomain) {
      return routes.tenant.article(
        article.publisher.subdomain,
        article.slug,
        options?.host,
        article.category?.slug
      );
    }
    if (article.author?.subdomain) {
      return routes.tenant.article(
        article.author.subdomain,
        article.slug,
        options?.host,
        article.category?.slug
      );
    }
  }

  const owner = getArticleOwner(article, options?.fallbackOwner);
  const relativePath = routes.feed.article(owner, article.slug);
  const activeHost = options?.host || getClientHost();

  const shouldBeAbsolute =
    Boolean(options?.absolute) || (activeHost ? !isMainAppHost(activeHost) : false);

  if (shouldBeAbsolute) {
    return `${getMainAppUrl(options?.host)}${relativePath}`;
  }

  return relativePath;
}

/**
 * Génère l'URL courte `/l/{shortCode}` d'un article si `article.shortCode` est présent.
 */
export function getArticleShortUrl(
  article: Pick<ArticleResolvable, 'shortCode' | 'author' | 'publisher'>,
  options?: {
    preferTenant?: boolean;
    host?: string;
    absolute?: boolean;
  }
): string | null {
  const shortCode = article.shortCode?.trim();
  if (!shortCode) return null;

  if (options?.preferTenant) {
    const customDomain = article.publisher?.customDomain || article.author?.customDomain;
    if (customDomain) {
      return `https://${customDomain}/l/${encodeURIComponent(shortCode)}`;
    }
    const subdomain = article.publisher?.subdomain || article.author?.subdomain;
    if (subdomain) {
      return routes.tenant.shortArticle(subdomain, shortCode, options?.host);
    }
  }

  const relativePath = routes.feed.shortArticle(shortCode);
  const activeHost = options?.host || getClientHost();

  const shouldBeAbsolute =
    Boolean(options?.absolute) || (activeHost ? !isMainAppHost(activeHost) : false);

  if (shouldBeAbsolute) {
    return `${getMainAppUrl(options?.host)}${relativePath}`;
  }

  return relativePath;
}

/**
 * Génère l'URL canonique d'une pensée (format absolu feed: https://qoe.fi/:username/thought/:id).
 * S'adapte dynamiquement au contexte d'environnement (lvh.me, qoe.test, production).
 */
export function getThoughtUrl(
  username?: string | null,
  id?: string | null,
  options?: {
    host?: string;
  }
): string {
  const mainAppUrl = getMainAppUrl(options?.host);
  const cleanUser = (username || 'author').replace(/^@/, '');
  const cleanId = id || '';
  return `${mainAppUrl}${routes.feed.thought(cleanUser, cleanId)}`;
}

/**
 * Génère l'URL d'un profil utilisateur.
 * S'adapte au contexte d'exécution (absolu si appelé depuis un autre sous-domaine/tenant).
 */
export function getProfileUrl(
  username?: string | null,
  options?: {
    tab?:
      'thoughts' | 'with_replies' | 'articles' | 'reposts' | 'media' | 'followers' | 'following';
    host?: string;
    absolute?: boolean;
  }
): string {
  const cleanUser = (username || 'author').replace(/^@/, '');
  const relativePath = routes.feed.profile(cleanUser, options?.tab);
  const activeHost = options?.host || getClientHost();

  const shouldBeAbsolute =
    Boolean(options?.absolute) || (activeHost ? !isMainAppHost(activeHost) : false);

  if (shouldBeAbsolute) {
    return `${getMainAppUrl(options?.host)}${relativePath}`;
  }

  return relativePath;
}
