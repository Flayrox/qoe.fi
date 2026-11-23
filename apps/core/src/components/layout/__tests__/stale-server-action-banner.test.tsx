// @vitest-environment jsdom
// L20c8 — StaleServerActionBanner : trois textes français en dur, dont le
// bouton de rechargement, alors que la bannière s'affiche pour TOUS les
// visiteurs d'un build périmé.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@qoe/utils', () => ({ isStaleServerActionError: () => true }));
vi.mock('@qoe/ui/button', () => ({
  Button: ({ children, ...rest }: { children: React.ReactNode }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

import { StaleServerActionBanner } from '../../StaleServerActionBanner';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

describe('StaleServerActionBanner — textes traduits', () => {
  it('passe le titre, le texte et le bouton par `t`', async () => {
    render(<StaleServerActionBanner />);

    fireEvent(
      window,
      new ErrorEvent('error', { error: new Error('Failed to find Server Action') })
    );

    await screen.findByRole('alert');
    expect(tCalls).toContain('Une nouvelle version est disponible');
    expect(tCalls).toContain('Recharger');
  });

  it('garde de source : aucune phrase française en dur', () => {
    const source = readFileSync(
      resolve(CORE_DIR, 'src/components/StaleServerActionBanner.tsx'),
      'utf-8'
    );
    expect(source).toContain("from '@lingui/core/macro'");
    expect(source).not.toMatch(/>\s*Une nouvelle version/);
    expect(source).not.toMatch(/>\s*Recharger\s*</);
  });
});
