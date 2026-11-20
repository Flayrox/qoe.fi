import { describe, it, expect } from 'vitest';
import { getCookieDomain, getCookieSecure } from '../cookie-config';

describe('getCookieDomain', () => {
  it('returns .lvh.me for local development hosts', () => {
    expect(getCookieDomain('localhost')).toBe(undefined);
    expect(getCookieDomain('localhost:3010')).toBe(undefined);
    expect(getCookieDomain('127.0.0.1')).toBe(undefined);
    expect(getCookieDomain('dashboard.lvh.me')).toBe('.lvh.me');
    expect(getCookieDomain('climat.lvh.me')).toBe('.lvh.me');
  });

  it('returns .qoe.test for qoe.test domain', () => {
    expect(getCookieDomain('qoe.test')).toBe('.qoe.test');
    expect(getCookieDomain('dashboard.qoe.test')).toBe('.qoe.test');
  });

  it('returns .qoe.fi for production domains', () => {
    expect(getCookieDomain('qoe.fi')).toBe('.qoe.fi');
    expect(getCookieDomain('dashboard.qoe.fi')).toBe('.qoe.fi');
    expect(getCookieDomain('creator.qoe.fi')).toBe('.qoe.fi');
  });
});

describe('getCookieSecure', () => {
  it('suit le schéma de l’origine publique, pas NODE_ENV', () => {
    // Build de production servi en clair (e2e local, intranet http) : un
    // cookie `Secure` y serait jeté par le navigateur.
    expect(getCookieSecure('http://lvh.me:15402')).toBe(false);
    expect(getCookieSecure('http://localhost:3010')).toBe(false);
    // Production réelle derrière TLS : `Secure` conservé.
    expect(getCookieSecure('https://qoe.fi')).toBe(true);
    expect(getCookieSecure('https://studio.qoe.fi')).toBe(true);
  });

  it('retombe sur l’environnement quand l’origine manque ou est illisible', () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(getCookieSecure()).toBe(true);
      expect(getCookieSecure('pas une url')).toBe(true);
      process.env.NODE_ENV = 'development';
      expect(getCookieSecure()).toBe(false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
