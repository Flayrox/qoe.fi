import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseHostContext,
  resolveAppUrl,
  getLandingAppUrl,
  getMainAppUrl,
  getStudioAppUrl,
  APP_DEV_PORTS,
} from '../domain-hub';
import { getLegalDocumentUrl, getLegalIndexUrl } from '../legal';

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
  });
});
