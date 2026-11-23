// @vitest-environment jsdom
// L20c8 — ReaderPageLayout : le manifeste de la plateforme s'affiche sous le
// titre géant de CHAQUE page lecteur, et il était écrit en français dur
// (aucun `t`) : l'interface `en` affichait une phrase française sur toutes les
// pages du lecteur.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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

vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ReaderPageLayout } from '../ReaderPageLayout';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

describe('ReaderPageLayout — manifeste traduit', () => {
  it('passe le texte du manifeste par `t`', () => {
    render(
      <ReaderPageLayout giantTitle="Lire">
        <div>contenu</div>
      </ReaderPageLayout>
    );

    expect(tCalls.some((call) => call.startsWith('Plateforme de lecture'))).toBe(true);
  });

  it('garde de source : plus aucun manifeste en dur', () => {
    const source = readFileSync(
      resolve(CORE_DIR, 'src/components/layout/ReaderPageLayout.tsx'),
      'utf-8'
    );
    expect(source).toContain("from '@lingui/core/macro'");
    expect(source).not.toMatch(/>\s*Plateforme de lecture/);
  });
});
