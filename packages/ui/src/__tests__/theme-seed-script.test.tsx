// @vitest-environment jsdom
// =====================================================================
// 🧪 ThemeSeedScript — anti-FOUC sans warning React
// =====================================================================
// Le seed de thème doit échapper au warning « Encountered a script tag
// while rendering React component ». Ce warning apparaissait car next/script
// expose un composant *client* re-rendu par React sur un router.refresh()
// (ex. login via le panneau dev). Le correctif : un <script> brut dans un
// serveur component, que React 19 hoiste dans le <head> sans jamais le
// re-rendre côté client.
// Ce test garde cette propriété : (1) le markup serveur émet le <script>,
// (2) le module n'importe plus next/script, (3) le rendu client ne loggue
// jamais le fameux warning.
// =====================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { ThemeSeedScript } from '@qoe/theme';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ThemeSeedScript — anti-FOUC sans warning React', () => {
  it('1. le markup serveur émet un <script id="qoe-theme-seed"> brut', () => {
    const html = renderToStaticMarkup(<ThemeSeedScript />);
    expect(html).toContain('<script');
    expect(html).toContain('id="qoe-theme-seed"');
    expect(html).toContain('localStorage');
  });

  it('2. le module ne dépend plus de next/script (composant client)', () => {
    // Vitest exécute les tests depuis la racine de packages/ui : le module
    // vité vit dans packages/theme/src/seed-script.tsx.
    const source = readFileSync(
      resolve(process.cwd(), '..', 'theme', 'src', 'seed-script.tsx'),
      'utf8'
    );
    // Seul un import réel de next/script (et non une mention en commentaire)
    // ramènerait le composant client responsable du warning.
    expect(source).not.toMatch(/from\s+['"]next\/script['"]/);
    expect(source).not.toMatch(/from\s+['"]next-script['"]/);
  });

  it('3. le rendu client ne loggue pas « Encountered a script tag »', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<ThemeSeedScript />);
    } finally {
      const errors = spy.mock.calls.map((c) => String(c[0] ?? '')).join('|');
      spy.mockRestore();
      expect(errors).not.toContain('Encountered a script tag');
    }
  });
});
