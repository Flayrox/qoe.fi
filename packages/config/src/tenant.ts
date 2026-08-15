// =====================================================================
// 🌐 @qoe/config/tenant — Multi-Tenant Subdomain Resolver
// =====================================================================

export const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'dashboard',
  'feed',
  'landing',
  'start',
  'www',
  'app',
  'auth',
  'static',
  'assets',
  'cdn',
] as const;

export const SYSTEM_DOMAINS = [
  'localhost',
  'qoe.test',
  'lvh.me',
  'qoe.fi',
  'www.qoe.fi',
  'start.qoe.fi',
  'api.qoe.fi',
  'umami.qoe.fi',
  'dashboard.qoe.fi',
  'admin.qoe.fi',
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
  let baseDomain = 'qoe.fi';

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
    baseDomain = 'qoe.fi';
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
 * 🔗 Calcule l'URL canonique de la plateforme principale (qoe.fi, lvh.me, etc.) selon l'hôte courant.
 */
export function getMainAppUrl(hostname: string, port = 3010): string {
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();

  if (hostWithoutPort.endsWith('lvh.me')) {
    return 'http://lvh.me:3010';
  }
  if (hostWithoutPort.endsWith('qoe.test')) {
    return 'http://qoe.test:3010';
  }
  if (hostWithoutPort === 'localhost' || hostWithoutPort.endsWith('.localhost')) {
    return `http://localhost:${port}`;
  }
  return 'https://qoe.fi';
}

/**
 * 🍪 Retourne le domaine de cookie Supabase Auth approprié pour le SSO multi-tenant.
 */
export function getAuthCookieDomain(hostname: string): string | undefined {
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();

  if (hostWithoutPort.endsWith('lvh.me')) return '.lvh.me';
  if (hostWithoutPort.endsWith('qoe.test')) return '.qoe.test';
  if (hostWithoutPort.endsWith('qoe.fi')) return '.qoe.fi';
  return undefined;
}
