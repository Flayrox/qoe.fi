// =====================================================================
// 🧪 @qoe/utils — tests de durcissement (lot 1 de docs/AUDIT-CHECKLIST.md)
// =====================================================================
// Chaque cas correspond à un défaut relevé pendant l'audit du package :
// il est écrit AVANT le correctif pour prouver qu'il échoue, puis conservé
// comme garde anti-régression.
// =====================================================================

import { describe, expect, it, vi, afterEach } from 'vitest';
import { escapeHtml, markdownToHtml } from '../markdown';
import { getSafeRedirectUrl } from '../redirect';
import { shortId, slugify, uuid } from '../slugify';
import { maskEmail, formatRelativeDate, truncate } from '../format';
import { normalizeArticleAttributions } from '../article-attribution';
import { buildArticlePath } from '../article-url';
import { actionErr, unwrapAction } from '../action';
import { isPrivateOrReservedIPv6, validateSafeExternalUrl } from '../ssrf';
import { sliceContentAtPaywall, ANONYMOUS_ENTITLEMENTS } from '../paywall';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('markdown — URLs de lien et d’image', () => {
  it('refuse les URLs protocol-relative (//evil.com) dans un lien', () => {
    const html = markdownToHtml('[clic](//evil.com/pwn)');
    expect(html).not.toContain('href="//evil.com');
    expect(html).toBe('<p>clic</p>');
  });

  it('refuse les URLs protocol-relative dans une image', () => {
    const html = markdownToHtml('![logo](//evil.com/track.png)');
    expect(html).not.toContain('<img');
    expect(html).toBe('<p>logo</p>');
  });

  it('refuse les barres obliques inversées (anti-contournement de parseur)', () => {
    const html = markdownToHtml('[clic](/\\evil.com)');
    expect(html).not.toContain('href="/\\evil.com');
  });

  it('échappe les guillemets dans une URL, même si l’appelant n’a pas échappé', () => {
    const html = markdownToHtml('[clic](https://qoe.fi/"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover=');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });

  it('échappe les guillemets du texte alternatif d’une image', () => {
    const html = markdownToHtml('![a"onerror="alert(1)](https://qoe.fi/i.png)');
    expect(html).not.toContain('"onerror=');
  });

  it('conserve les esperluettes de requête sous forme échappée', () => {
    const html = markdownToHtml('[q](https://qoe.fi/?a=1&b=2)');
    expect(html).toContain('href="https://qoe.fi/?a=1&amp;b=2"');
  });
});

describe('redirect — injection d’en-tête', () => {
  it('refuse un chemin contenant un saut de ligne', () => {
    expect(getSafeRedirectUrl('/home\r\nSet-Cookie: pwned=1', '/safe')).toBe('/safe');
    expect(getSafeRedirectUrl('/home\n', '/safe')).toBe('/safe');
  });

  it('refuse un CRLF encodé', () => {
    expect(getSafeRedirectUrl('/home%0d%0aSet-Cookie:x', '/safe')).toBe('/safe');
  });

  it('refuse les caractères de contrôle', () => {
    expect(getSafeRedirectUrl('/home\u0000', '/safe')).toBe('/safe');
  });
});

describe('slugify — translittération et borne de longueur', () => {
  it('translittère les ligatures et lettres non décomposables', () => {
    expect(slugify('Cœur & Œuvre')).toBe('coeur-oeuvre');
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Æther')).toBe('aether');
    expect(slugify('smørrebrød')).toBe('smorrebrod');
    expect(slugify('Łódź')).toBe('lodz');
  });

  it('borne la longueur et ne finit jamais par un tiret', () => {
    const slug = slugify('a '.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(96);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('shortId — source d’aléa', () => {
  it('refuse une longueur absurde au lieu de boucler', () => {
    expect(() => shortId(0)).toThrow();
    expect(() => shortId(-3)).toThrow();
    expect(() => shortId(10_000)).toThrow();
  });
});

describe('uuid — pas de repli non cryptographique', () => {
  it('lève une erreur quand aucune source cryptographique n’existe', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => uuid()).toThrow();
  });

  it('produit un v4 conforme depuis getRandomValues', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) array[i] = (i * 37) % 256;
        return array;
      },
    });
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('format — entrées dégradées', () => {
  it('rend une chaîne vide pour une date invalide', () => {
    expect(formatRelativeDate('pas-une-date')).toBe('');
    expect(formatRelativeDate(new Date(Number.NaN))).toBe('');
  });

  it('tronque sans casser une paire de substitution', () => {
    const out = truncate('😀😀😀', 2);
    expect(out).toBe('😀😀…');
    expect(out).not.toContain('\uFFFD');
  });

  it('ne divulgue rien pour un email malformé', () => {
    expect(maskEmail('pas-un-email')).toBe('***');
    expect(maskEmail('a@b@c')).toBe('***');
    expect(maskEmail('jean@qoe.fi')).toBe('j***@qoe.fi');
  });
});

describe('article-attribution — ordre sûr', () => {
  it('produit des ordres entiers distincts et sûrs', () => {
    const result = normalizeArticleAttributions(
      [{ userId: 'b' }, { userId: 'c' }, { userId: 'a' }],
      'a'
    );
    const orders = result.map((entry) => entry.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders.every((order) => Number.isSafeInteger(order))).toBe(true);
    expect(orders[0]).toBe(0);
  });
});

describe('article-url — segments de chemin', () => {
  it('neutralise une tentative de traversée de répertoire', () => {
    expect(buildArticlePath({ slug: '../../etc/passwd', category: { slug: 'tech' } })).toBe(
      '/tech/etcpasswd'
    );
  });

  it('neutralise les barres obliques dans un slug de catégorie', () => {
    expect(buildArticlePath({ slug: 'ok', category: { slug: 'a/b' } })).toBe('/ab/ok');
  });
});

describe('action — code d’erreur préservé', () => {
  it('expose le code structuré sur l’erreur levée', () => {
    try {
      unwrapAction(actionErr('Refusé', 'FORBIDDEN'));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { code?: string }).code).toBe('FORBIDDEN');
    }
  });
});

describe('ssrf — formes IPv6 équivalentes', () => {
  it('décode les IPv4-mapped en notation hexadécimale', () => {
    expect(isPrivateOrReservedIPv6('::ffff:7f00:1')).toBe(true); // 127.0.0.1
    expect(isPrivateOrReservedIPv6('::ffff:a00:1')).toBe(true); // 10.0.0.1
    expect(isPrivateOrReservedIPv6('0:0:0:0:0:ffff:7f00:1')).toBe(true);
    expect(isPrivateOrReservedIPv6('::ffff:808:808')).toBe(false); // 8.8.8.8
  });

  it('bloque le préfixe NAT64 64:ff9b::/96', () => {
    expect(isPrivateOrReservedIPv6('64:ff9b::7f00:1')).toBe(true);
  });

  it('reste bloquant sur une URL littérale en forme longue', async () => {
    const result = await validateSafeExternalUrl('http://[0:0:0:0:0:ffff:7f00:1]/admin');
    expect(result.valid).toBe(false);
  });
});

describe('paywall — portabilité hors Node', () => {
  it('mesure les octets sans dépendre de Buffer', () => {
    vi.stubGlobal('Buffer', undefined);
    const cut = sliceContentAtPaywall(
      '<p>public</p><p>réservé</p><!--paywall--><p>secret</p>',
      ANONYMOUS_ENTITLEMENTS,
      'MEMBERS_ONLY'
    );
    expect(cut.isTruncated).toBe(true);
    expect(cut.paywallMeta?.totalLengthBytes).toBeGreaterThan(0);
    expect(cut.content).not.toContain('secret');
  });
});

describe('escapeHtml — couverture', () => {
  it('échappe les guillemets simples et doubles', () => {
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
  });
});
