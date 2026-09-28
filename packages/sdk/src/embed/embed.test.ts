import { describe, expect, it } from 'vitest';
import {
  EmbedValidationError,
  buildSubscribePopupUrl,
  buildSubscribeRequest,
  cleanReturnUrl,
  isTrustedPopupOrigin,
  parsePopupResult,
  qoeLogoUrl,
} from './embed';

describe('buildSubscribeRequest', () => {
  it('construit la requête vers la publication publique, email normalisé', () => {
    const req = buildSubscribeRequest({
      apiBase: 'https://api.qoe.fi/',
      publication: 'mon-journal',
      email: '  Lecteur@Exemple.fr ',
    });
    expect(req.url).toBe('https://api.qoe.fi/v1/publications/mon-journal/subscribe');
    expect(req.method).toBe('POST');
    expect(JSON.parse(req.body)).toEqual({ email: 'lecteur@exemple.fr' });
  });

  it('ajoute la locale explicite fr/en seulement', () => {
    const fr = buildSubscribeRequest({
      apiBase: 'https://a.b',
      publication: 'p',
      email: 'a@b.fr',
      locale: 'en',
    });
    expect(fr.url).toContain('?locale=en');
    const other = buildSubscribeRequest({
      apiBase: 'https://a.b',
      publication: 'p',
      email: 'a@b.fr',
      locale: 'de' as 'fr',
    });
    expect(other.url).not.toContain('locale=');
  });

  it('refuse base, publication et email invalides avant tout réseau', () => {
    expect(() =>
      buildSubscribeRequest({ apiBase: 'ftp://x', publication: 'p', email: 'a@b.fr' })
    ).toThrow(EmbedValidationError);
    expect(() =>
      buildSubscribeRequest({ apiBase: 'https://a.b', publication: '  ', email: 'a@b.fr' })
    ).toThrow(EmbedValidationError);
    expect(() =>
      buildSubscribeRequest({ apiBase: 'https://a.b', publication: 'p', email: 'pas-un-email' })
    ).toThrow(EmbedValidationError);
    expect(() =>
      buildSubscribeRequest({ apiBase: 'https://a.b', publication: 'p', email: 'a@b' })
    ).toThrow(EmbedValidationError);
  });

  it("n'envoie jamais d'identifiant secret : que l'identifiant public", () => {
    const req = buildSubscribeRequest({
      apiBase: 'https://a.b',
      publication: 'pub_123',
      email: 'a@b.fr',
    });
    expect(req.body).not.toMatch(/key|secret|token/i);
    expect(Object.keys(req.headers)).toEqual(['Content-Type']);
  });
});

describe('parcours compte (popup)', () => {
  it('construit une URL qoe.fi avec publication et retour validé', () => {
    const url = buildSubscribePopupUrl({
      appBase: 'https://qoe.fi/',
      publication: 'mon-journal',
      returnUrl: 'https://blog.example.com/merci',
    });
    expect(url.startsWith('https://qoe.fi/subscribe-with-qoefi?')).toBe(true);
    expect(url).toContain('publication=mon-journal');
    expect(url).toContain(encodeURIComponent('https://blog.example.com/merci'));
  });

  it('refuse les URL de retour non http(s)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'notaurl', 'ftp://f.b/x']) {
      expect(() =>
        buildSubscribePopupUrl({ appBase: 'https://qoe.fi', publication: 'p', returnUrl: bad })
      ).toThrow(EmbedValidationError);
    }
  });
});

describe('cleanReturnUrl', () => {
  it('accepte http/https, refuse le reste', () => {
    expect(cleanReturnUrl('https://example.com/a?b=c')).toContain('https://example.com/a');
    expect(cleanReturnUrl('http://example.com/')).toContain('http://example.com/');
    expect(cleanReturnUrl('javascript:alert(1)')).toBeNull();
    expect(cleanReturnUrl('')).toBeNull();
  });
});

describe('isTrustedPopupOrigin', () => {
  it("n'accepte que l'origine exacte de l'app", () => {
    expect(isTrustedPopupOrigin('https://qoe.fi', 'https://qoe.fi')).toBe(true);
    expect(isTrustedPopupOrigin('https://qoe.fi/', 'https://qoe.fi')).toBe(true);
    expect(isTrustedPopupOrigin('https://evil-qoe.fi', 'https://qoe.fi')).toBe(false);
    expect(isTrustedPopupOrigin('https://qoe.fi.evil.com', 'https://qoe.fi')).toBe(false);
    expect(isTrustedPopupOrigin('http://qoe.fi', 'https://qoe.fi')).toBe(false);
    expect(isTrustedPopupOrigin('nonsense', 'https://qoe.fi')).toBe(false);
  });
});

describe('parsePopupResult', () => {
  it("n'accepte que le résultat minimal exact", () => {
    expect(parsePopupResult({ ok: true })).toEqual({ ok: true });
    expect(parsePopupResult({ cancelled: true })).toEqual({ cancelled: true });
    // Tout le reste est rejeté : pas de session, token ni email.
    for (const bad of [
      { ok: true, session: 'abc' },
      { ok: true, email: 'a@b.fr' },
      { token: 'abc' },
      { ok: false },
      { ok: 'yes' },
      'ok',
      null,
      [],
    ]) {
      expect(parsePopupResult(bad)).toBeNull();
    }
  });
});

describe('qoeLogoUrl', () => {
  it('pointe vers le logo officiel servi par qoe.fi', () => {
    expect(qoeLogoUrl('https://qoe.fi/')).toBe('https://qoe.fi/brand/q-symbol.svg');
    expect(() => qoeLogoUrl('notaurl')).toThrow(EmbedValidationError);
  });
});
