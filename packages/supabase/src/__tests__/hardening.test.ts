// =====================================================================
// 🧪 @qoe/supabase — durcissement (L05)
// =====================================================================
// Défauts constatés : `endsWith('qoe.fi')` acceptait `evilqoe.fi`, un
// `Domain=` était posé sur des IP, un JWT sans `exp` restait valide, et un
// message quelconque du canal inter-onglets déclenchait la logique d'auth.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { getCookieDomain, isIpLiteral } from '../cookie-config';
import { signJWT, verifyJWT } from '../sso';
import { isAuthBroadcastMessage } from '../broadcast';

describe('L05 — domaine de cookie', () => {
  it('partage le cookie sur les sous-domaines contrôlés', () => {
    expect(getCookieDomain('qoe.fi')).toBe('.qoe.fi');
    expect(getCookieDomain('studio.qoe.fi')).toBe('.qoe.fi');
    expect(getCookieDomain('qoe.test')).toBe('.qoe.test');
    expect(getCookieDomain('studio.qoe.test')).toBe('.qoe.test');
    expect(getCookieDomain('lvh.me')).toBe('.lvh.me');
  });

  it('ne confond pas un suffixe trompeur avec le domaine contrôlé', () => {
    expect(getCookieDomain('evilqoe.fi')).toBe('.evilqoe.fi');
    expect(getCookieDomain('evilqoe.test')).toBe('.evilqoe.test');
    expect(getCookieDomain('notlvh.me')).toBe('.notlvh.me');
  });

  it('ne pose jamais de cookie sur localhost, une IP ou un hôte simple', () => {
    expect(getCookieDomain('localhost')).toBeUndefined();
    expect(getCookieDomain('127.0.0.1')).toBeUndefined();
    expect(getCookieDomain('192.168.1.10')).toBeUndefined();
    expect(getCookieDomain('::1')).toBeUndefined();
    expect(getCookieDomain('[::1]')).toBeUndefined();
    expect(getCookieDomain('redis')).toBeUndefined();
  });

  it('ignore le port et la casse', () => {
    expect(getCookieDomain('Studio.QOE.FI:15404')).toBe('.qoe.fi');
  });

  it('reconnaît les IP littérales', () => {
    expect(isIpLiteral('10.0.0.1')).toBe(true);
    expect(isIpLiteral('[2001:db8::1]')).toBe(true);
    expect(isIpLiteral('qoe.fi')).toBe(false);
  });
});

describe('L05 — JWT SSO', () => {
  const secret = 'un-secret-de-test-suffisamment-long';

  it('signe et vérifie un jeton', async () => {
    const token = await signJWT({ sub: 'u1' }, secret, 30);
    const payload = await verifyJWT(token, secret);
    expect(payload?.sub).toBe('u1');
    expect(typeof payload?.exp).toBe('number');
  });

  it('refuse un jeton expiré', async () => {
    const token = await signJWT({ sub: 'u1' }, secret, -10);
    expect(await verifyJWT(token, secret)).toBeNull();
  });

  it('refuse une signature falsifiée', async () => {
    const token = await signJWT({ sub: 'u1' }, secret, 30);
    const [header, payload] = token.split('.');
    expect(await verifyJWT(`${header}.${payload}.AAAA`, secret)).toBeNull();
    expect(await verifyJWT(token, 'un-autre-secret')).toBeNull();
  });

  it('refuse de signer ou vérifier sans secret (jeton forgeable)', async () => {
    await expect(signJWT({ sub: 'u1' }, '', 30)).rejects.toThrow(/secret JWT manquant/);
    await expect(verifyJWT('a.b.c', '')).rejects.toThrow(/secret JWT manquant/);
  });
});

describe('L05 — messages inter-onglets', () => {
  it("n'accepte que les événements d'auth connus", () => {
    expect(isAuthBroadcastMessage({ event: 'SIGNED_IN', timestamp: 1 })).toBe(true);
    expect(isAuthBroadcastMessage({ event: 'SIGNED_OUT', timestamp: 1 })).toBe(true);
    expect(isAuthBroadcastMessage({ event: 'HACK', timestamp: 1 })).toBe(false);
    expect(isAuthBroadcastMessage({ event: 'SIGNED_IN' })).toBe(false);
    expect(isAuthBroadcastMessage(null)).toBe(false);
    expect(isAuthBroadcastMessage('SIGNED_IN')).toBe(false);
  });
});
