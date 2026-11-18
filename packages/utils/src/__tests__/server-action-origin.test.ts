import { describe, expect, it } from 'vitest';

import { isCrossOriginServerAction } from '../server-action-origin';

const action = (headers: Record<string, string>, method = 'POST') => ({
  method,
  headers: new Headers(headers),
});

describe('🛡️ server-action-origin — requêtes acceptées', () => {
  it('accepte une server action de même origine', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', origin: 'https://qoe.fi', 'next-action': 'a1' })
      )
    ).toBe(false);
  });

  it('accepte un sous-domaine déclaré par X-Forwarded-Host', () => {
    expect(
      isCrossOriginServerAction(
        action({
          host: 'app:3000',
          'x-forwarded-host': 'studio.qoe.fi',
          origin: 'https://studio.qoe.fi',
          'next-action': 'a1',
        })
      )
    ).toBe(false);
  });

  it('ignore les requêtes qui ne sont pas des server actions', () => {
    expect(isCrossOriginServerAction(action({ host: 'qoe.fi' }))).toBe(false);
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', origin: 'https://evil.test', 'next-action': 'a1' }, 'GET')
      )
    ).toBe(false);
  });
});

describe('🛡️ server-action-origin — requêtes refusées', () => {
  it('refuse une origine différente', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', origin: 'https://evil.test', 'next-action': 'a1' })
      )
    ).toBe(true);
  });

  it('refuse une origine qui change de port', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', origin: 'https://qoe.fi:8443', 'next-action': 'a1' })
      )
    ).toBe(true);
  });

  it('refuse une origine opaque ou illisible', () => {
    for (const origin of ['null', 'file:///etc/passwd', 'javascript:alert(1)', 'pas une url']) {
      expect(
        isCrossOriginServerAction(action({ host: 'qoe.fi', origin, 'next-action': 'a1' }))
      ).toBe(true);
    }
  });

  it('refuse une requête sans Host de référence', () => {
    expect(
      isCrossOriginServerAction(action({ origin: 'https://qoe.fi', 'next-action': 'a1' }))
    ).toBe(true);
  });

  it('refuse une requête sans Origin marquée cross-site', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', 'next-action': 'a1', 'sec-fetch-site': 'cross-site' })
      )
    ).toBe(true);
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', 'next-action': 'a1', 'sec-fetch-site': 'same-site' })
      )
    ).toBe(true);
  });

  it('refuse la casse trompeuse d’un hôte', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'qoe.fi', origin: 'https://qoe.fi.evil.test', 'next-action': 'a1' })
      )
    ).toBe(true);
  });

  it('accepte un hôte identique écrit en majuscules', () => {
    expect(
      isCrossOriginServerAction(
        action({ host: 'QOE.FI', origin: 'https://qoe.fi', 'next-action': 'a1' })
      )
    ).toBe(false);
  });
});
