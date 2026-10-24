// =====================================================================
// 🌐 @qoe/config/tenant — Multi-Tenant Subdomain Resolver
// =====================================================================

import { getMainAppUrl as resolveMainUrl } from './domain-hub';

export const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'dashboard', // legacy (pré-renommage) — réservé pour les anciens liens
  'feed', // legacy
  'landing', // legacy
  'start', // legacy
  'hi',
  'core',
  'tenants',
  'studio',
  'www',
  'app',
  'auth',
  'static',
  'assets',
  'cdn',
] as const;

/**
 * Segments de premier niveau déjà utilisés par une route statique d'un site
 * tenant. Une catégorie avec l'un de ces slugs serait inaccessible : la route
 * statique gagne toujours sur le catch-all [categorySlug].
 *
 * Source : apps/tenants/src/app/tenant/[domain] + routes racine de l'app.
 * Le test de parité `reserved-routes.test.ts` échoue si une route est ajoutée
 * sans être réservée ici (et dans identifier.go côté Go).
 */
export const RESERVED_TENANT_ROUTES = [
  'about',
  'team',
  'thoughts',
  'author',
  'article',
  'articles',
  'search',
  'support',
  'sitemap',
  'exit',
  'rss.xml',
  'api',
  'auth',
  'tenant',
  'robots.txt',
  'sitemap.xml',
  'icon.svg',
] as const;

/**
 * 🔒 Vrai si un slug de catégorie entre en collision avec une route du site.
 * Normalise la casse et les slashs de bord, comme la validation Go.
 */
export function isReservedTenantRoute(slug: string): boolean {
  const normalized = slug
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  return (RESERVED_TENANT_ROUTES as readonly string[]).includes(normalized);
}

export const SYSTEM_DOMAINS = [
  'localhost',
  'qoe.test',
  'lvh.me',
  'qoefi',
  'www.qoe.fi',
  'hi.qoe.fi',
  'api.qoe.fi',
  'umami.qoe.fi',
  'studio.qoe.fi',
  'dashboard.qoe.fi', // legacy — conservé pour les anciens liens
  'admin.qoe.fi',
  'base.admin.qoe.fi', // Supabase Studio (cert dédié, jamais un tenant)
] as const;

export interface TenantInfo {
  hostWithoutPort: string;
  subdomain: string | null;
  isSystemDomain: boolean;
  isTenantSite: boolean;
  baseDomain: string;
}

/**
 * 🔍 Analyser un Host (ex: climat.lvh.me:3000 ou climat.qoe.fi) et extraire les métadonnées de tenant.
 */
export function parseTenantHost(hostname: string): TenantInfo {
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();

  let subdomain: string | null = null;
  let baseDomain = 'qoefi';

  if (hostWithoutPort.endsWith('.localhost')) {
    subdomain = hostWithoutPort.replace('.localhost', '');
    baseDomain = 'localhost';
  } else if (hostWithoutPort.endsWith('.qoe.test')) {
    subdomain = hostWithoutPort.replace('.qoe.test', '');
    baseDomain = 'qoe.test';
  } else if (hostWithoutPort.endsWith('.lvh.me')) {
    subdomain = hostWithoutPort.replace('.lvh.me', '');
    baseDomain = 'lvh.me';
  } else if (hostWithoutPort.endsWith('.qoe.fi')) {
    subdomain = hostWithoutPort.replace('.qoe.fi', '');
    baseDomain = 'qoefi';
  } else if (!(SYSTEM_DOMAINS as readonly string[]).includes(hostWithoutPort)) {
    // 🌐 Custom Domain resolution (e.g. blog.alice.com)
    subdomain = hostWithoutPort;
    baseDomain = hostWithoutPort;
  }

  const isReserved = subdomain
    ? (RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain)
    : false;
  const isSystemDomain =
    (SYSTEM_DOMAINS as readonly string[]).includes(hostWithoutPort) || isReserved || !subdomain;

  return {
    hostWithoutPort,
    subdomain: isSystemDomain ? null : subdomain,
    isSystemDomain,
    isTenantSite: !isSystemDomain && !!subdomain,
    baseDomain,
  };
}

/**
 * 🔗 Calcule l'URL canonique de la plateforme principale (qoefi, lvh.me, etc.) selon l'hôte courant.
 * Délégué au Domain Hub.
 */
export function getMainAppUrl(hostname: string, port = 15402): string {
  return resolveMainUrl(hostname, port);
}

/**
 * 🍪 Retourne le domaine de cookie Supabase Auth approprié pour le SSO multi-tenant.
 */
export function getAuthCookieDomain(hostname: string): string | undefined {
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();

  if (hostWithoutPort.endsWith('lvh.me')) return '.lvh.me';
  if (hostWithoutPort.endsWith('qoe.test')) return '.qoe.test';
  if (hostWithoutPort.endsWith('qoefi')) return '.qoe.fi';
  return undefined;
}
