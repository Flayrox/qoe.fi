// @vitest-environment jsdom
// =====================================================================
// 🧪 Durcissement studio — en-têtes, cookie d'espace, HTML et SVG injectés
// =====================================================================
// Ces quatre briques sont la charnière entre « ça s'affiche » et « ça ne peut
// pas exécuter de code dans la session d'un auteur ». On teste le refus, pas
// seulement le cas nominal.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { parseWorkspaceCookie } from '@qoe/sdk/workspace';

import { studioSecurityHeaders } from '../security-headers';
import { WORKSPACE_COOKIE_MAX_AGE, workspaceCookie } from '../workspace-cookie';
import { isSafeInlineSvg, sanitizeInlineSvg } from '../sanitize-inline-svg';
import { sanitizePreviewHtml } from '../sanitize-preview-html';
import { SUPPORTED_LOCALES, safeLocale } from '../locale-header';

describe('studioSecurityHeaders', () => {
  const headers = studioSecurityHeaders();
  const byKey = new Map(headers.map((header) => [header.key, header.value]));

  it('n’émet aucune clé en double', () => {
    expect(new Set(headers.map((h) => h.key)).size).toBe(headers.length);
  });

  it('interdit le MIME sniffing et le cadrage externe', () => {
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byKey.get('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('limite les API navigateur sensibles', () => {
    expect(byKey.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('isole la fenêtre tout en gardant les retours OAuth', () => {
    expect(byKey.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    expect(byKey.get('X-Permitted-Cross-Domain-Policies')).toBe('none');
  });

  it('garde la CSP en observation, jamais bloquante', () => {
    expect(byKey.has('Content-Security-Policy')).toBe(false);
    const csp = byKey.get('Content-Security-Policy-Report-Only') ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('ne laisse aucune valeur vide', () => {
    for (const header of headers) {
      expect(header.value.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('safeLocale', () => {
  it('accepte une langue supportée', () => {
    expect(safeLocale('fr')).toBe('fr');
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
  });

  it('retombe sur la langue par défaut pour une valeur inconnue', () => {
    expect(safeLocale('zz')).toBe('fr');
    expect(safeLocale('')).toBe('fr');
    expect(safeLocale(null)).toBe('fr');
    expect(safeLocale(undefined)).toBe('fr');
    // Une valeur forgée ne doit jamais traverser telle quelle.
    expect(safeLocale('fr\r\nX-Injected: 1')).toBe('fr');
  });
});

describe('workspaceCookie', () => {
  it('pose un cookie lisible par le client et sécurisé en production', () => {
    const cookie = workspaceCookie({ type: 'MEDIA', id: 'media-1' }, true);

    expect(cookie.name).toBe('qoe_active_workspace');
    expect(cookie.options).toEqual({
      path: '/',
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: true,
      // L'en-tête de bascule doit pouvoir le relire.
      httpOnly: false,
    });
    expect(WORKSPACE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it('reste utilisable en HTTP local de développement', () => {
    expect(workspaceCookie({ type: 'PERSONAL', id: 'p-1' }, false).options.secure).toBe(false);
  });

  it('produit une valeur que le parseur partagé relit', () => {
    const cookie = workspaceCookie({ type: 'MEDIA', id: 'media-42' }, false);
    expect(parseWorkspaceCookie(cookie.value)).toEqual({ type: 'MEDIA', id: 'media-42' });
  });
});

describe('sanitizeInlineSvg', () => {
  const qr = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

  it('laisse passer un QR légitime', () => {
    expect(sanitizeInlineSvg(qr)).toBe(qr);
    expect(isSafeInlineSvg(qr)).toBe(true);
  });

  it('refuse un SVG porteur de script', () => {
    expect(sanitizeInlineSvg(`${qr}<script>alert(1)</script>`)).toBeNull();
  });

  it('refuse un gestionnaire inline', () => {
    expect(sanitizeInlineSvg('<svg onload="alert(1)"></svg>')).toBeNull();
  });

  it('refuse foreignObject et les ressources distantes', () => {
    expect(sanitizeInlineSvg('<svg><foreignObject><div/></foreignObject></svg>')).toBeNull();
    expect(sanitizeInlineSvg('<svg><image href="https://evil.test/x.png"/></svg>')).toBeNull();
  });

  it('refuse une URL javascript ou une entité XML', () => {
    expect(sanitizeInlineSvg('<svg><a href="javascript:alert(1)"></a></svg>')).toBeNull();
    expect(sanitizeInlineSvg('<?xml version="1.0"?><!DOCTYPE svg><svg></svg>')).toBeNull();
  });

  it('refuse ce qui n’est pas un fragment SVG', () => {
    expect(sanitizeInlineSvg('<div>QR</div>')).toBeNull();
    expect(sanitizeInlineSvg('   ')).toBeNull();
    expect(sanitizeInlineSvg(null)).toBeNull();
    expect(sanitizeInlineSvg(undefined)).toBeNull();
  });
});

describe('sanitizePreviewHtml', () => {
  it('conserve la mise en forme d’un article', () => {
    const html = '<h2>Titre</h2><p>Texte <strong>fort</strong> et <em>doucement</em>.</p>';
    const clean = sanitizePreviewHtml(html);

    expect(clean).toContain('<h2>Titre</h2>');
    expect(clean).toContain('<strong>fort</strong>');
    expect(clean).toContain('<em>doucement</em>');
  });

  it('conserve les images et les liens utiles', () => {
    const clean = sanitizePreviewHtml(
      '<p><a href="https://qoe.fi/x">lien</a><img src="https://cdn.qoe.fi/a.png" alt="a"></p>'
    );

    expect(clean).toContain('href="https://qoe.fi/x"');
    expect(clean).toContain('alt="a"');
  });

  it('retire les scripts, iframes et formulaires', () => {
    const clean = sanitizePreviewHtml(
      '<p>ok</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><form><input></form>'
    );

    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('iframe');
    expect(clean).not.toContain('form');
  });

  it('retire les gestionnaires d’événements collés', () => {
    const clean = sanitizePreviewHtml('<img src="x" onerror="alert(1)"><p onclick="evil()">t</p>');

    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('onclick');
  });

  it('neutralise les URL javascript', () => {
    const clean = sanitizePreviewHtml('<a href="javascript:alert(1)">clic</a>');
    expect(clean).not.toContain('javascript:');
  });

  it('conserve le repère de paywall de l’éditeur', () => {
    const clean = sanitizePreviewHtml('<p>a</p><div data-type="paywall-divider"></div><p>b</p>');
    expect(clean).toContain('data-type="paywall-divider"');
  });

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(sanitizePreviewHtml('')).toBe('');
  });
});
