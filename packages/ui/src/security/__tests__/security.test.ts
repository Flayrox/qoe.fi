// =====================================================================
// Tests des assainisseurs partagés (passe 4, T1/T2/T3)
// =====================================================================
// Chaque cas d'attaque est écrit comme le ferait un auteur malveillant, et
// chaque cas légitime vérifie qu'on ne casse pas le rendu normal.
// =====================================================================

import { describe, expect, it } from 'vitest';

import { sanitizeArticleHtml } from '../article-html';
import { isSafeInlineSvg, sanitizeInlineSvg } from '../inline-svg';

describe('sanitizeArticleHtml — attaques', () => {
  it('retire les balises script', () => {
    const out = sanitizeArticleHtml('<p>Bonjour</p><script>alert(1)</script>');
    expect(out).toContain('<p>Bonjour</p>');
    expect(out.toLowerCase()).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('retire les gestionnaires inline', () => {
    const out = sanitizeArticleHtml('<img src="/a.png" onerror="alert(1)"><p onclick="x()">t</p>');
    expect(out).not.toMatch(/onerror|onclick/i);
  });

  it('neutralise les URL javascript:', () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">clic</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('retire les iframes, objets et embeds', () => {
    const out = sanitizeArticleHtml(
      '<iframe src="https://evil.test/x"></iframe><object data="x"></object><embed src="x">'
    );
    expect(out.toLowerCase()).not.toContain('<iframe');
    expect(out.toLowerCase()).not.toContain('<object');
    expect(out.toLowerCase()).not.toContain('<embed');
  });

  it('retire les vecteurs de ressource distante non contrôlée', () => {
    const out = sanitizeArticleHtml(
      '<img src="/ok.png" srcset="https://evil.test/a.png 2x"><video poster="https://evil.test/p.jpg"></video><link rel="stylesheet" href="https://evil.test/s.css">'
    );
    expect(out).not.toContain('srcset');
    expect(out).not.toContain('poster');
    expect(out.toLowerCase()).not.toContain('<video');
    expect(out.toLowerCase()).not.toContain('<link');
    expect(out).toContain('src="/ok.png"');
  });

  it('retire les formulaires et champs', () => {
    const out = sanitizeArticleHtml(
      '<form action="https://evil.test"><input name="password"><button>ok</button></form>'
    );
    expect(out.toLowerCase()).not.toContain('<form');
    expect(out.toLowerCase()).not.toContain('<input');
    expect(out.toLowerCase()).not.toContain('<button');
  });

  it('retire les déclarations de style et les métadonnées de page', () => {
    const out = sanitizeArticleHtml(
      '<style>body{display:none}</style><meta http-equiv="refresh" content="0">'
    );
    expect(out.toLowerCase()).not.toContain('<style');
    expect(out.toLowerCase()).not.toContain('<meta');
  });

  it('retire srcdoc et formaction même sur des balises autorisées', () => {
    const out = sanitizeArticleHtml(
      '<div srcdoc="<script>x</script>">a</div><button formaction="x">b</button>'
    );
    expect(out).not.toContain('srcdoc');
    expect(out).not.toContain('formaction');
  });
});

describe('sanitizeArticleHtml — rendu légitime', () => {
  it('conserve le balisage éditorial', () => {
    const html =
      '<h2>Titre</h2><p>Un <strong>mot</strong> <em>italique</em> <mark>surligné</mark>.</p>' +
      '<blockquote>Citation</blockquote><ul><li>a</li></ul>' +
      '<figure><img src="https://cdn.test/x.png" alt="x" width="10" height="10"><figcaption>Légende</figcaption></figure>' +
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>' +
      '<p>H<sub>2</sub>O et E=mc<sup>2</sup></p>';
    const out = sanitizeArticleHtml(html);
    for (const tag of [
      '<h2',
      '<p',
      '<strong',
      '<em',
      '<mark',
      '<blockquote',
      '<ul',
      '<li',
      '<figure',
      '<img',
      '<figcaption',
      '<table',
      '<thead',
      '<th',
      '<tbody',
      '<td',
      '<sub',
      '<sup',
    ]) {
      expect(out).toContain(tag);
    }
    expect(out).toContain('src="https://cdn.test/x.png"');
    expect(out).toContain('alt="x"');
  });

  it('conserve les ancres et les attributs de données connus', () => {
    const out = sanitizeArticleHtml(
      '<a href="https://qoe.fi/a" target="_blank" rel="noopener">lien</a><p data-indent="2" data-drop-cap="1">x</p>'
    );
    expect(out).toContain('href="https://qoe.fi/a"');
    expect(out).toContain('data-indent="2"');
  });

  it('retourne une chaîne vide pour une entrée vide', () => {
    expect(sanitizeArticleHtml('')).toBe('');
    expect(sanitizeArticleHtml(null)).toBe('');
    expect(sanitizeArticleHtml(undefined)).toBe('');
  });
});

describe('sanitizeInlineSvg — attaques', () => {
  const attacks: Array<[string, string]> = [
    ['script', '<svg><script>alert(1)</script></svg>'],
    [
      'foreignObject',
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject></svg>',
    ],
    ['image distante', '<svg><image href="https://evil.test/x.png"/></svg>'],
    ['use externe', '<svg><use href="https://evil.test/x.svg#a"/></svg>'],
    ['gestionnaire inline', '<svg onload="alert(1)"><rect/></svg>'],
    ['javascript:', '<svg><a href="javascript:alert(1)"><rect/></a></svg>'],
    ['xlink distant', '<svg><rect xlink:href="//evil.test/x"/></svg>'],
    ['URI data', '<svg><image href="data:image/svg+xml;base64,AAA"/></svg>'],
    ['style inline', '<svg><style>body{display:none}</style></svg>'],
    ['doctype', '<!DOCTYPE svg><svg></svg>'],
    ['iframe', '<svg><iframe src="https://evil.test"></iframe></svg>'],
  ];

  it.each(attacks)('refuse le SVG contenant un %s', (_label, payload) => {
    expect(sanitizeInlineSvg(payload)).toBeNull();
    expect(isSafeInlineSvg(payload)).toBe(false);
  });

  it('refuse un fragment qui n’est pas un SVG', () => {
    expect(sanitizeInlineSvg('<div>pas un svg</div>')).toBeNull();
    expect(sanitizeInlineSvg('')).toBeNull();
    expect(sanitizeInlineSvg(null)).toBeNull();
    expect(sanitizeInlineSvg(undefined)).toBeNull();
  });
});

describe('sanitizeInlineSvg — rendu légitime', () => {
  it('accepte un QR TOTP standard', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"><rect width="33" height="33" fill="#fff"/><path d="M0 0h7v7H0z" fill="#000"/></svg>';
    expect(sanitizeInlineSvg(svg)).toBe(svg);
    expect(isSafeInlineSvg(svg)).toBe(true);
  });

  it('tolère les espaces de tête et de queue', () => {
    expect(sanitizeInlineSvg('\n  <svg viewBox="0 0 1 1"><rect/></svg>  \n')).toBe(
      '<svg viewBox="0 0 1 1"><rect/></svg>'
    );
  });
});
