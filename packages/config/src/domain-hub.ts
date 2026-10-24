// =====================================================================
// 🌐 DOMAIN HUB — Résolution Dynamique des URLs & Symétrie d'Environnement
// =====================================================================
// Standard Silicon Valley : Aucune URL absolue hardcodée.
// Le contexte de la requête (`hostname` / `x-forwarded-host` / `window.location.host`)
// dicte le domaine racine pour TOUS les liens inter-applications :
//   - Sur *.lvh.me     -> tous les liens restent sur *.lvh.me (ports dédiés)
//   - Sur *.qoe.test   -> tous les liens restent sur *.qoe.test
//   - Sur localhost    -> tous les liens restent sur localhost
//   - Sur qoe.fi (prod)-> tous les liens ciblent les sous-domaines officiels
//
// 🔒 Préserve l'intégrité des cookies Supabase SSO partagés sur `.{rootDomain}`.
// =====================================================================

export type AppService =
  'landing' | 'app' | 'feed' | 'studio' | 'admin' | 'tenant' | 'api' | 'collab';

export interface ResolveOptions {
  subdomain?: string | null;
  customDomain?: string | null;
  path?: string;
  port?: number;
}

export interface HostContext {
  rawHost: string;
  hostWithoutPort: string;
  port: string | null;
  protocol: 'http' | 'https';
  rootDomain: string;
  isDev: boolean;
  isCaddy: boolean;
}

export const APP_DEV_PORTS: Record<AppService, number> = {
  landing: 15401,
  app: 15402,
  feed: 15402,
  tenant: 15403,
  studio: 15404,
  admin: 15405,
  collab: 15406,
  api: 15407,
};

export const APP_PROD_SUBDOMAINS: Record<AppService, string | null> = {
  landing: 'hi',
  app: null, // qoe.fi racine
  feed: null,
  tenant: null, // géré dynamiquement par {subdomain}.qoe.fi ou customDomain
  studio: 'studio',
  admin: 'admin',
  collab: 'collab',
  api: 'api',
};

/**
 * Analyse le host courant pour extraire la racine d'environnement.
 */
export function parseHostContext(hostname?: string): HostContext {
  let raw = (hostname || '').trim();

  // Auto-détection côté navigateur si aucun hostname n'est passé ou si seul un sous-domaine isolé est passé
  const win =
    typeof globalThis !== 'undefined' && 'window' in globalThis
      ? (globalThis as { window?: { location?: { host?: string } } }).window
      : undefined;
  if (win && win.location?.host) {
    if (!raw || (!raw.includes('.') && !raw.includes(':'))) {
      raw = win.location.host;
    }
  }

  const [hostWithoutPortRaw, portPart] = raw.split(':');
  const hostWithoutPort = (hostWithoutPortRaw || '').toLowerCase();
  const port = portPart || null;

  // Détection du mode développement local
  const isLvh = hostWithoutPort.endsWith('lvh.me');
  const isQoeTest = hostWithoutPort.endsWith('qoe.test');
  const isLocalhost =
    hostWithoutPort === 'localhost' ||
    hostWithoutPort === '127.0.0.1' ||
    hostWithoutPort.endsWith('.localhost');
  const isDevHost = isLvh || isQoeTest || isLocalhost;

  const isQoeFi = hostWithoutPort === 'qoe.fi' || hostWithoutPort.endsWith('.qoe.fi');

  // Si l'hôte cible explicitement le domaine officiel de production
  if (isQoeFi) {
    return {
      rawHost: raw,
      hostWithoutPort,
      port,
      protocol: 'https',
      rootDomain: 'qoe.fi',
      isDev: false,
      isCaddy: false,
    };
  }

  const isDevEnv =
    isDevHost || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  // Si on est en dev sans port explicite, on est probablement derrière un reverse-proxy local (Caddy)
  const isCaddy = isDevEnv && !port;

  let rootDomain = 'qoe.fi';
  let isDev = false;

  if (isLvh) {
    rootDomain = 'lvh.me';
    isDev = true;
  } else if (isQoeTest) {
    rootDomain = 'qoe.test';
    isDev = true;
  } else if (isLocalhost) {
    rootDomain = 'localhost';
    isDev = true;
  } else if (isDevEnv) {
    // Si aucun hostname n'est spécifié mais qu'on est en dev
    const envCandidate =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_LANDING_URL ||
      process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
      '';
    if (envCandidate.includes('lvh.me')) {
      rootDomain = 'lvh.me';
    } else if (envCandidate.includes('qoe.test')) {
      rootDomain = 'qoe.test';
    } else if (envCandidate.includes('localhost') || envCandidate.includes('127.0.0.1')) {
      rootDomain = 'localhost';
    } else {
      rootDomain = 'lvh.me';
    }
    isDev = true;
  } else {
    rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'qoe.fi';
    isDev = false;
  }

  const protocol: 'http' | 'https' = isDev ? 'http' : 'https';

  return {
    rawHost: raw,
    hostWithoutPort,
    port,
    protocol,
    rootDomain,
    isDev,
    isCaddy,
  };
}

/**
 * Résout dynamiquement l'URL absolue d'un service dans le même contexte de domaine.
 */
export function resolveAppUrl(
  service: AppService,
  currentHost?: string,
  options?: ResolveOptions
): string {
  const context = parseHostContext(currentHost);
  const targetPath = options?.path ? `/${options.path.replace(/^\/+/, '')}` : '';

  // 1. Mode Production
  if (!context.isDev) {
    // Si c'est un site tenant avec nom de domaine sur-mesure propre (ex: blog.alex.com)
    if (service === 'tenant') {
      if (options?.customDomain) {
        return `https://${options.customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}${targetPath}`;
      }
      const sub = options?.subdomain || 'demo';
      return `https://${sub}.${context.rootDomain}${targetPath}`;
    }

    const prodSub = APP_PROD_SUBDOMAINS[service];
    if (prodSub) {
      return `https://${prodSub}.${context.rootDomain}${targetPath}`;
    }
    return `https://${context.rootDomain}${targetPath}`;
  }

  // 2. Mode Développement (lvh.me, qoe.test, localhost)
  const portNum = options?.port ?? APP_DEV_PORTS[service];
  const devPort = context.isCaddy ? '' : `:${portNum}`;

  switch (service) {
    case 'tenant': {
      if (options?.customDomain) {
        return `http://${options.customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}${devPort}${targetPath}`;
      }
      const sub = options?.subdomain || 'demo';
      if (context.rootDomain === 'localhost') {
        return `http://${sub}.localhost${devPort}${targetPath}`;
      }
      return `http://${sub}.${context.rootDomain}${devPort}${targetPath}`;
    }

    case 'studio':
      if (context.rootDomain === 'localhost') {
        return `http://studio.localhost${devPort}${targetPath}`;
      }
      return `http://studio.${context.rootDomain}${devPort}${targetPath}`;

    case 'admin':
      if (context.rootDomain === 'localhost') {
        return `http://admin.localhost${devPort}${targetPath}`;
      }
      return `http://admin.${context.rootDomain}${devPort}${targetPath}`;

    case 'collab':
      return `ws://${context.rootDomain}${devPort}${targetPath}`;

    case 'api':
      if (context.rootDomain === 'localhost') {
        return `http://localhost${devPort}${targetPath}`;
      }
      return `http://api.${context.rootDomain}${devPort}${targetPath}`;

    case 'landing':
      // apps/hi est servie à la racine de son port dédié
      return `http://${context.rootDomain}${devPort}${targetPath}`;

    case 'app':
    case 'feed':
    default:
      // apps/core est servie à la racine de son port dédié
      return `http://${context.rootDomain}${devPort}${targetPath}`;
  }
}

/**
 * Alias de compatibilité pour l'URL de la vitrine publique (landing / apps/hi).
 */
export function getLandingAppUrl(hostname?: string, port?: number): string {
  return resolveAppUrl('landing', hostname, port ? { port } : undefined);
}

/**
 * Alias de compatibilité pour l'URL de l'application principale (apps/core).
 */
export function getMainAppUrl(hostname?: string, port?: number): string {
  return resolveAppUrl('app', hostname, port ? { port } : undefined);
}

/**
 * Alias de compatibilité pour l'URL du Studio créateur (apps/studio).
 */
export function getStudioAppUrl(hostname?: string, port?: number): string {
  return resolveAppUrl('studio', hostname, port ? { port } : undefined);
}
