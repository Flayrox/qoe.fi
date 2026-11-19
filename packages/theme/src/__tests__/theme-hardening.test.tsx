// @vitest-environment jsdom
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { readThemeCookie, getThemeCookieDomain } from '../cookie';
import { buildCreatorVars, ThemeStyle } from '../ThemeStyle';

// Le test tourne soit depuis `packages/theme` (turbo), soit depuis la racine
// du dépôt — `import.meta.url` n'est pas une URL `file:` sous Vitest.
function readSource(relative: string): string {
  const candidates = [
    join(process.cwd(), relative),
    join(process.cwd(), 'packages/theme', relative),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`fichier introuvable : ${relative}`);
  return readFileSync(found, 'utf8');
}

afterEach(() => {
  // Restaure le cookie natif de jsdom entre les cas.
  delete (document as unknown as Record<string, unknown>)['cookie'];
});

describe('🍪 cookie de thème', () => {
  it('survit à une valeur mal encodée plutôt que de casser le montage', () => {
    // F141 — `decodeURIComponent` lève une URIError sur `%E0%A4%A` : un cookie
    // abîmé (ancienne app, extension, copie manuelle) faisait planter l'effet
    // de `CookieReader`, donc le provider de thème, donc toute l'app.
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'qoe_theme=%E0%A4%A',
      set: () => {},
    });

    expect(() => readThemeCookie()).not.toThrow();
    expect(readThemeCookie()).toBeNull();
  });

  it('ne revendique le domaine parent que pour qoe.fi et ses sous-domaines', () => {
    // F143 — `hostname.endsWith('qoe.fi')` acceptait `evilqoe.fi` : le cookie
    // de thème était alors écrit avec `Domain=.qoe.fi` depuis un hôte étranger.
    expect(getThemeCookieDomain('studio.qoe.fi')).toBe('.qoe.fi');
    expect(getThemeCookieDomain('qoe.fi')).toBe('.qoe.fi');
    expect(getThemeCookieDomain('evilqoe.fi')).toBeNull();
    expect(getThemeCookieDomain('localhost')).toBeNull();
  });
});

describe('🎨 overrides de thème créateur', () => {
  it('refuse un accent qui n’est pas une couleur HEX', () => {
    // F142 — la valeur était concaténée telle quelle dans une balise <style>
    // rendue en SSR : `#fff;</style><script>…` sortait de la feuille.
    const vars = buildCreatorVars({ accentColor: '#fff;</style><script>alert(1)</script>' });
    expect(vars['--primary']).toBeUndefined();
    expect(vars['--tenant-accent']).toBeUndefined();
  });

  it('refuse une famille de police qui n’est pas une clé de registre', () => {
    const vars = buildCreatorVars({ fontFamily: 'serif); } html{display:none' });
    expect(vars['--font-active']).toBeUndefined();
  });

  it('n’émet aucune balise exécutable dans la feuille de style', () => {
    const html = renderToStaticMarkup(
      <ThemeStyle creator={{ accentColor: '#fff;</style><script>alert(1)</script>' }} />
    );
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('conserve un accent HEX valide tel quel', () => {
    expect(buildCreatorVars({ accentColor: '#0284C7' })['--primary']).toBe('#0284C7');
  });
});

describe('🔤 police par défaut', () => {
  it('n’expose jamais un token qui se référence lui-même', () => {
    // F144 — `@theme inline` redéclarait `--font-sans`, `--font-heading`,
    // `--font-outfit`, `--font-space-grotesk` et `--font-serif` en
    // auto-référence : aucun bloc ne définissait `--font-sans` ni
    // `--font-heading`, donc `font-heading` ne pointait vers aucune pile du
    // paquet et `font-sans` dépendait implicitement de la variable posée par
    // `next/font` dans chaque app.
    // Les commentaires citent l'ancien motif : on analyse le CSS effectif.
    const css = readSource('src/styles/index.css').replace(/\/\*[\s\S]*?\*\//g, '');

    const selfReferences = [...css.matchAll(/(--font-[a-z-]+)\s*:\s*var\(\s*\1\s*\)/g)].map(
      (match) => match[1]
    );
    expect(selfReferences).toEqual([]);

    const definitions = [...css.matchAll(/--font-sans\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(definitions.some((value) => !value.startsWith('var('))).toBe(true);
  });
});

describe('🧪 exécution des tests du paquet', () => {
  it('déclare un script `test`, sans quoi ces tests ne tournent dans aucun pipeline', () => {
    const pkg = JSON.parse(readSource('package.json')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.test).toBe('vitest run');
  });
});
