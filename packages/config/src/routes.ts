// =====================================================================
// 🗺️ REGISTRE DE ROUTES TYPE-SAFE — qoe.fi (Silicon Valley Standard)
// =====================================================================
// 📖 Permet de construire TOUTES les URLs du monorepo sans aucune
//    chaîne de caractères hardcodée.
//    Rendu 100% type-safe, autocomplété et incassable au refactoring.
// =====================================================================

import { getMonorepoUrl } from './constants';

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
    library: () => '/library',
    highlights: () => '/highlights',
    billing: () => '/billing',
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
    article: (slug: string) => `/article/${encodeURIComponent(slug)}`,
    post: (id: string) => `/post/${encodeURIComponent(id)}`,
    thought: (username: string, id: string) =>
      `/${encodeURIComponent(username.replace(/^@/, ''))}/thought/${encodeURIComponent(id)}`,
    notifications: () => '/notifications',
    search: () => '/search',
    starterPacks: () => '/starter-packs',
    starterPack: (id: string) => `/starter-packs/${encodeURIComponent(id)}`,
  },

  /** 🎨 Creator Studio App (`apps/studio`) */
  dashboard: {
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
  },

  /** 🛡️ Superadmin Dashboard App (`apps/admin`) */
  admin: {
    home: () => '/admin',
    users: {
      list: () => '/admin/users',
      detail: (id: string) => `/admin/users/${encodeURIComponent(id)}`,
    },
    config: () => '/admin/config',
    frontend: () => '/admin/frontend',
    translations: () => '/admin/translations',
    widgets: () => '/admin/widgets',
    api: () => '/admin/api',
  },

  /** 🌐 Page d'exposition Hi (`apps/hi`) */
  landing: {
    home: () => '/',
    start: () => '/start',
    pricing: () => '/pricing',
    privacy: () => '/privacy',
    terms: () => '/terms',
  },

  /** 🌐 Multi-Tenant Creator Sites (`apps/tenants`) */
  tenant: {
    home: (subdomain: string, host?: string) => `${getMonorepoUrl('tenant', host, subdomain)}/`,
    article: (subdomain: string, slug: string, host?: string) =>
      `${getMonorepoUrl('tenant', host, subdomain)}/article/${encodeURIComponent(slug)}`,
  },
} as const;

export type AppRoutes = typeof routes;
