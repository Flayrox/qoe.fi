import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseTenantHost, getAuthCookieDomain, RESERVED_SUBDOMAINS } from '../tenant';
import { resolveLegalDbSlug, toPublicLegalSlug } from '../legal';
import { getMonorepoUrl } from '../constants';
import { resolveAppUrl } from '../domain-hub';
import { parseEnv } from '../env';

describe('🌐 parseTenantHost — domaine racine', () => {
  it('reconnaît l’apex qoe.fi comme domaine système, pas comme un site tenant', () => {
    // F155 — `qoe.fi` n'était ni dans SYSTEM_DOMAINS ni suffixé par `.qoe.fi` :
    // l'apex tombait dans la branche « custom domain » et devenait un tenant
    // nommé `qoe.fi` (mauvais proxy, mauvais sitemap).
    const apex = parseTenantHost('qoe.fi');
    expect(apex.isSystemDomain).toBe(true);
    expect(apex.isTenantSite).toBe(false);
    expect(apex.subdomain).toBeNull();
  });

  it('laisse passer un vrai domaine personnalisé', () => {
    const custom = parseTenantHost('blog.alice.com');
    expect(custom.isTenantSite).toBe(true);
    expect(custom.subdomain).toBe('blog.alice.com');
    expect(custom.baseDomain).toBe('blog.alice.com');
  });
});

describe('🚫 RESERVED_SUBDOMAINS — parité avec Go', () => {
  // Liste exacte de `apps/api/internal/shared/identifier/identifier.go`
  // (`var reserved`), plus les hôtes propres au produit.
  const GO_RESERVED = [
    'admin',
    'api',
    'app',
    'auth',
    'billing',
    'blog',
    'cdn',
    'dashboard',
    'dev',
    'developer',
    'developers',
    'docs',
    'download',
    'email',
    'feed',
    'files',
    'help',
    'home',
    'login',
    'mail',
    'main',
    'media',
    'metrics',
    'onboarding',
    'payments',
    'portal',
    'qoe',
    'root',
    'search',
    'settings',
    'staging',
    'start',
    'static',
    'status',
    'store',
    'studio',
    'support',
    'system',
    'uploads',
    'web',
    'www',
  ];

  it('couvre tout ce que le serveur refuse comme sous-domaine', () => {
    // F160 — la liste TypeScript ne contenait que 16 entrées sur 41 :
    // `parseTenantHost('media.qoe.fi')` ou `('search.qoe.fi')` classait un
    // hôte du produit en site tenant. Le serveur, lui, refusait ces noms.
    const missing = GO_RESERVED.filter(
      (name) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(name)
    );
    expect(missing).toEqual([]);
  });

  it('traite ces hôtes comme système, jamais comme sites tenants', () => {
    for (const name of GO_RESERVED) {
      const info = parseTenantHost(`${name}.qoe.fi`);
      expect(info.isSystemDomain, name).toBe(true);
      expect(info.isTenantSite, name).toBe(false);
    }
  });
});

describe('🍪 getAuthCookieDomain', () => {
  it('couvre tous les sous-domaines de production', () => {
    // F156 — le test `endsWith('qoefi')` ne matchait ni `qoe.fi` ni
    // `studio.qoe.fi` : le cookie SSO n'était jamais partagé sur le domaine
    // parent en production.
    expect(getAuthCookieDomain('qoe.fi')).toBe('.qoe.fi');
    expect(getAuthCookieDomain('studio.qoe.fi')).toBe('.qoe.fi');
    expect(getAuthCookieDomain('climat.qoe.fi')).toBe('.qoe.fi');
    expect(getAuthCookieDomain('qoefi')).toBe('.qoe.fi');
  });

  it('couvre les environnements locaux', () => {
    expect(getAuthCookieDomain('lvh.me')).toBe('.lvh.me');
    expect(getAuthCookieDomain('climat.lvh.me:15403')).toBe('.lvh.me');
    expect(getAuthCookieDomain('qoe.test')).toBe('.qoe.test');
    expect(getAuthCookieDomain('studio.qoe.test')).toBe('.qoe.test');
    expect(getAuthCookieDomain('localhost')).toBeUndefined();
  });

  it('refuse un hôte étranger qui finit par la même chaîne', () => {
    // Même classe que F143 : `evilqoefi` et `evillvh.me` revendiquaient le
    // domaine du produit.
    expect(getAuthCookieDomain('evilqoefi')).toBeUndefined();
    expect(getAuthCookieDomain('evillvh.me')).toBeUndefined();
    expect(getAuthCookieDomain('notqoe.test')).toBeUndefined();
  });
});

describe('⚖️ slugs légaux', () => {
  it('ne laisse pas une clé du prototype traverser la résolution', () => {
    // F157 — `LEGAL_SLUG_MAP[clean] || clean` renvoyait
    // `Object.prototype.constructor` (une fonction) pour `/legal/constructor` :
    // un slug d'URL arbitraire devenait une fonction passée au SDK.
    expect(resolveLegalDbSlug('constructor')).toBe('constructor');
    expect(resolveLegalDbSlug('__proto__')).toBe('__proto__');
    expect(toPublicLegalSlug('constructor')).toBe('constructor');
    expect(typeof toPublicLegalSlug('toString')).toBe('string');
  });

  it('continue de mapper les alias connus', () => {
    expect(resolveLegalDbSlug('notice')).toBe('mentions-legales');
    expect(resolveLegalDbSlug('Privacy')).toBe('politique-confidentialite');
    expect(toPublicLegalSlug('politique-confidentialite')).toBe('privacy');
  });
});

describe('🔗 getMonorepoUrl — une seule résolution', () => {
  const host = 'media.lvh.me:15403';

  it('délègue au Domain Hub pour chaque application', () => {
    // F158 — `getMonorepoUrl` recopiait la table des ports et des sous-domaines
    // de `domain-hub` ; elle en avait déjà divergé.
    expect(getMonorepoUrl('feed', host)).toBe(resolveAppUrl('app', host));
    expect(getMonorepoUrl('studio', host)).toBe(resolveAppUrl('studio', host));
    expect(getMonorepoUrl('admin', host)).toBe(resolveAppUrl('admin', host));
    expect(getMonorepoUrl('api', host)).toBe(resolveAppUrl('api', host));
    expect(getMonorepoUrl('tenant', host, 'alice')).toBe(
      resolveAppUrl('tenant', host, { subdomain: 'alice' })
    );
  });

  it('sert la vitrine à la racine de son port, comme apps/hi', () => {
    // `apps/hi` est servie sur `http://lvh.me:15401` (et `http://qoe.test` via
    // Caddy) : la forme `start.<domaine>` ne correspond à aucune route.
    expect(getMonorepoUrl('landing', host)).toBe('http://lvh.me:15401');
    expect(getMonorepoUrl('landing', 'qoe.test')).toBe('http://qoe.test');
  });

  it('garde la documentation sur son site de production', () => {
    expect(getMonorepoUrl('docs', host)).toBe('https://docs.qoe.fi');
  });
});

describe('🔐 parseEnv (navigateur) — URLs publiques', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('transmet NEXT_PUBLIC_STUDIO_URL au client comme les autres URLs', () => {
    // F159 — la branche navigateur omettait `NEXT_PUBLIC_STUDIO_URL` de
    // `clientValues` : la valeur configurée était remplacée par le défaut
    // `http://studio.localhost`, alors que `NEXT_PUBLIC_DASHBOARD_URL` (même
    // application) était bien transmis.
    vi.stubEnv('NEXT_PUBLIC_STUDIO_URL', 'https://studio.example.com');
    vi.stubEnv('NEXT_PUBLIC_DASHBOARD_URL', 'https://studio.example.com');

    const parsed = parseEnv();
    expect(parsed.NEXT_PUBLIC_STUDIO_URL).toBe('https://studio.example.com');
    expect(parsed.NEXT_PUBLIC_STUDIO_URL).toBe(parsed.NEXT_PUBLIC_DASHBOARD_URL);
  });
});
