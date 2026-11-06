import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseHostContext,
  resolveAppUrl,
  getLandingAppUrl,
  getMainAppUrl,
  getStudioAppUrl,
  isMainAppHost,
  APP_DEV_PORTS,
} from '../domain-hub';
import { getLegalDocumentUrl, getLegalIndexUrl } from '../legal';
import { getThoughtUrl, getArticleUrl, getProfileUrl } from '../routes';

describe('@qoe/config domain-hub', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('parseHostContext', () => {
    it('detects lvh.me with port in dev', () => {
      const ctx = parseHostContext('louisrobin.lvh.me:15403');
      expect(ctx.isDev).toBe(true);
      expect(ctx.rootDomain).toBe('lvh.me');
      expect(ctx.port).toBe('15403');
      expect(ctx.protocol).toBe('http');
    });

    it('detects qoe.test in dev', () => {
      const ctx = parseHostContext('louisrobin.qoe.test:15403');
      expect(ctx.isDev).toBe(true);
      expect(ctx.rootDomain).toBe('qoe.test');
      expect(ctx.protocol).toBe('http');
    });

    it('detects localhost in dev', () => {
      const ctx = parseHostContext('localhost:15403');
      expect(ctx.isDev).toBe(true);
      expect(ctx.rootDomain).toBe('localhost');
      expect(ctx.protocol).toBe('http');
    });

    it('detects production domain when NODE_ENV is production and not on dev domain', () => {
      process.env.NODE_ENV = 'production';
      const ctx = parseHostContext('louisrobin.qoe.fi');
      expect(ctx.isDev).toBe(false);
      expect(ctx.rootDomain).toBe('qoe.fi');
      expect(ctx.protocol).toBe('https');
    });
  });

  describe('resolveAppUrl with lvh.me', () => {
    const host = 'louisrobin.lvh.me:15403';

    it('resolves landing on lvh.me with landing dev port', () => {
      const url = resolveAppUrl('landing', host);
      expect(url).toBe(`http://lvh.me:${APP_DEV_PORTS.landing}`);
    });

    it('resolves app/feed on lvh.me with app dev port', () => {
      const url = resolveAppUrl('app', host);
      expect(url).toBe(`http://lvh.me:${APP_DEV_PORTS.app}`);
    });

    it('resolves studio on lvh.me with studio dev port and subdomain', () => {
      const url = resolveAppUrl('studio', host);
      expect(url).toBe(`http://studio.lvh.me:${APP_DEV_PORTS.studio}`);
    });

    it('resolves tenant subdomain on lvh.me', () => {
      const url = resolveAppUrl('tenant', host, { subdomain: 'alice' });
      expect(url).toBe(`http://alice.lvh.me:${APP_DEV_PORTS.tenant}`);
    });

    it('preserves path properly', () => {
      const url = resolveAppUrl('landing', host, { path: '/legal/mentions-legales' });
      expect(url).toBe(`http://lvh.me:${APP_DEV_PORTS.landing}/legal/mentions-legales`);
    });
  });

  describe('resolveAppUrl with localhost', () => {
    const host = 'localhost:15403';

    it('resolves landing on localhost with landing dev port', () => {
      const url = resolveAppUrl('landing', host);
      expect(url).toBe(`http://localhost:${APP_DEV_PORTS.landing}`);
    });

    it('resolves app on localhost with app dev port', () => {
      const url = resolveAppUrl('app', host);
      expect(url).toBe(`http://localhost:${APP_DEV_PORTS.app}`);
    });
  });

  describe('resolveAppUrl with qoe.test', () => {
    const host = 'louisrobin.qoe.test:15403';

    it('resolves all services symmetrically on qoe.test', () => {
      expect(resolveAppUrl('landing', host)).toBe(`http://qoe.test:${APP_DEV_PORTS.landing}`);
      expect(resolveAppUrl('app', host)).toBe(`http://qoe.test:${APP_DEV_PORTS.app}`);
      expect(resolveAppUrl('studio', host)).toBe(`http://studio.qoe.test:${APP_DEV_PORTS.studio}`);
    });
  });

  describe('resolveAppUrl in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('resolves to standard HTTPS subdomains', () => {
      const host = 'qoe.fi';
      expect(resolveAppUrl('landing', host)).toBe('https://hi.qoe.fi');
      expect(resolveAppUrl('app', host)).toBe('https://qoe.fi');
      expect(resolveAppUrl('studio', host)).toBe('https://studio.qoe.fi');
      expect(resolveAppUrl('tenant', host, { subdomain: 'alex' })).toBe('https://alex.qoe.fi');
    });

    it('resolves tenant custom domain with https', () => {
      const host = 'qoe.fi';
      expect(resolveAppUrl('tenant', host, { customDomain: 'custom.blog.com' })).toBe(
        'https://custom.blog.com'
      );
    });
  });

  describe('compatibility aliases', () => {
    it('getLandingAppUrl returns landing url on matching domain', () => {
      expect(getLandingAppUrl('louisrobin.lvh.me:15403')).toBe('http://lvh.me:15401');
      expect(getLandingAppUrl('louisrobin.lvh.me:15403', 3000)).toBe('http://lvh.me:3000');
    });

    it('getMainAppUrl returns app url on matching domain', () => {
      expect(getMainAppUrl('louisrobin.lvh.me:15403')).toBe('http://lvh.me:15402');
    });

    it('getStudioAppUrl returns studio url on matching domain', () => {
      expect(getStudioAppUrl('louisrobin.lvh.me:15403')).toBe('http://studio.lvh.me:15404');
    });

    it('getLegalDocumentUrl returns legal document on matching domain', () => {
      expect(getLegalDocumentUrl('mentions-legales', 'louisrobin.lvh.me:15403')).toBe(
        'http://lvh.me:15401/legal/legal-notice'
      );
      expect(getLegalDocumentUrl('mentions-legales', 'louisrobin.qoe.test:15403')).toBe(
        'http://qoe.test:15401/legal/legal-notice'
      );
      expect(getLegalDocumentUrl('mentions-legales', 'localhost:15403')).toBe(
        'http://localhost:15401/legal/legal-notice'
      );
    });

    it('getLegalIndexUrl returns legal index on matching domain', () => {
      expect(getLegalIndexUrl('louisrobin.lvh.me:15403')).toBe('http://lvh.me:15401/legal');
    });

    it('getThoughtUrl returns canonical thought url across environments', () => {
      expect(getThoughtUrl('camille', 'p1', { host: 'louisrobin.lvh.me:15403' })).toBe(
        'http://lvh.me:15402/camille/thought/p1'
      );
      expect(getThoughtUrl('camille', 'p1', { host: 'louisrobin.qoe.test:15403' })).toBe(
        'http://qoe.test:15402/camille/thought/p1'
      );
      expect(getThoughtUrl('camille', 'p1', { host: 'qoe.test' })).toBe(
        'http://qoe.test/camille/thought/p1'
      );
      expect(getThoughtUrl('@camille', 'p1', { host: 'mon-blog.qoe.fi' })).toBe(
        'https://qoe.fi/camille/thought/p1'
      );
    });

    it('isMainAppHost detects main reader app correctly', () => {
      expect(isMainAppHost('qoe.fi')).toBe(true);
      expect(isMainAppHost('www.qoe.fi')).toBe(true);
      expect(isMainAppHost('studio.qoe.fi')).toBe(false);
      expect(isMainAppHost('admin.qoe.fi')).toBe(false);
      expect(isMainAppHost('climat.qoe.fi')).toBe(false);

      expect(isMainAppHost('lvh.me:15402')).toBe(true);
      expect(isMainAppHost('studio.lvh.me:15404')).toBe(false);
      expect(isMainAppHost('climat.lvh.me:15403')).toBe(false);

      expect(isMainAppHost('qoe.test')).toBe(true);
      expect(isMainAppHost('studio.qoe.test')).toBe(false);
    });

    it('getArticleUrl adapts relative vs absolute based on host context', () => {
      const article = {
        slug: 'mon-bel-article',
        author: { username: 'alex' },
      };

      // Sur le reader core (main app) -> URL relative pour navigation SPA rapide
      expect(getArticleUrl(article, { host: 'qoe.fi' })).toBe('/alex/a/mon-bel-article');
      expect(getArticleUrl(article, { host: 'lvh.me:15402' })).toBe('/alex/a/mon-bel-article');

      // Hors du reader core -> URL absolue canonique vers l'app principale
      expect(getArticleUrl(article, { host: 'studio.qoe.fi' })).toBe(
        'https://qoe.fi/alex/a/mon-bel-article'
      );
      expect(getArticleUrl(article, { host: 'studio.lvh.me:15404' })).toBe(
        'http://lvh.me:15402/alex/a/mon-bel-article'
      );
      expect(getArticleUrl(article, { host: 'climat.lvh.me:15403' })).toBe(
        'http://lvh.me:15402/alex/a/mon-bel-article'
      );

      // Force absolute
      expect(getArticleUrl(article, { host: 'qoe.fi', absolute: true })).toBe(
        'https://qoe.fi/alex/a/mon-bel-article'
      );
    });

    it('getProfileUrl adapts relative vs absolute based on host context', () => {
      expect(getProfileUrl('alex', { host: 'qoe.fi' })).toBe('/alex');
      expect(getProfileUrl('alex', { host: 'studio.qoe.fi' })).toBe('https://qoe.fi/alex');
      expect(getProfileUrl('alex', { host: 'climat.lvh.me:15403' })).toBe(
        'http://lvh.me:15402/alex'
      );
      expect(getProfileUrl('alex', { host: 'qoe.fi', absolute: true, tab: 'articles' })).toBe(
        'https://qoe.fi/alex/articles'
      );
    });
  });
});
