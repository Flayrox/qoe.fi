// @vitest-environment jsdom
// L20c8 — MainContentWrapper : aucun lien d'évitement et `<main>` sans `id`.
// La sidebar (9 entrées) et l'en-tête mobile précèdent le contenu sur CHAQUE
// page : au clavier, il faut les retraverser à chaque navigation (WCAG 2.4.1).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return `[${message}]`;
  },
}));

import { MainContentWrapper } from '../MainContentWrapper';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

describe('MainContentWrapper — lien d’évitement', () => {
  it('offre un lien vers le contenu et cible un `<main>` focalisable', () => {
    render(
      <MainContentWrapper>
        <p>contenu</p>
      </MainContentWrapper>
    );

    const skip = screen.getByRole('link', { name: /Aller au contenu principal/ });
    const main = screen.getByRole('main');
    const target = skip.getAttribute('href')?.replace('#', '');
    expect(target).toBeTruthy();
    expect(main.id).toBe(target);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('garde de source : le lien reste le premier élément focusable', () => {
    const source = readFileSync(
      resolve(CORE_DIR, 'src/components/layout/MainContentWrapper.tsx'),
      'utf-8'
    );
    expect(source).toContain("from '@lingui/core/macro'");
    expect(source.indexOf('href="#')).toBeLessThan(source.indexOf('<main'));
  });
});
