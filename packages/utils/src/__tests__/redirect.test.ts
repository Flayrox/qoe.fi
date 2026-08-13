import { describe, it, expect } from 'vitest';
import { getSafeRedirectUrl } from '../redirect';

describe('getSafeRedirectUrl', () => {
  it('returns fallbackPath when targetUrl is empty or null', () => {
    expect(getSafeRedirectUrl(null, '/home')).toBe('/home');
    expect(getSafeRedirectUrl('', '/home')).toBe('/home');
    expect(getSafeRedirectUrl('   ', '/home')).toBe('/home');
  });

  it('allows safe relative paths', () => {
    expect(getSafeRedirectUrl('/library')).toBe('/library');
    expect(getSafeRedirectUrl('/settings?tab=general')).toBe('/settings?tab=general');
    expect(getSafeRedirectUrl('/home')).toBe('/home');
  });

  it('blocks open redirect attempts with protocol-relative URLs or backslashes', () => {
    expect(getSafeRedirectUrl('//evil.com', '/home')).toBe('/home');
    expect(getSafeRedirectUrl('/\\evil.com', '/home')).toBe('/home');
    expect(getSafeRedirectUrl('/%5Cevil.com', '/home')).toBe('/home');
    expect(getSafeRedirectUrl('/http:evil.com', '/home')).toBe('/home');
  });

  it('allows absolute URLs matching allowed domain whitelist', () => {
    expect(getSafeRedirectUrl('http://lvh.me:3010/home')).toBe('http://lvh.me:3010/home');
    expect(getSafeRedirectUrl('http://dashboard.lvh.me:3020/analytics')).toBe(
      'http://dashboard.lvh.me:3020/analytics'
    );
    expect(getSafeRedirectUrl('https://qoe.fi/home')).toBe('https://qoe.fi/home');
  });

  it('blocks absolute URLs to unallowed external domains', () => {
    expect(getSafeRedirectUrl('https://malicious-phishing.com/login', '/home')).toBe('/home');
  });
});
