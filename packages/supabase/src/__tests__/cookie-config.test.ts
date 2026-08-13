import { describe, it, expect } from 'vitest';
import { getCookieDomain } from '../cookie-config';

describe('getCookieDomain', () => {
  it('returns .lvh.me for local development hosts', () => {
    expect(getCookieDomain('localhost')).toBe('.lvh.me');
    expect(getCookieDomain('localhost:3010')).toBe('.lvh.me');
    expect(getCookieDomain('127.0.0.1')).toBe('.lvh.me');
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
