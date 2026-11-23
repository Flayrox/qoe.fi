// @vitest-environment jsdom
// =====================================================================
// L20c7 — InAppPlacement : garanties écrites AVANT correctif
// =====================================================================
// Le bouton de fermeture portait `aria-label="Fermer cette notification"`
// en français dur : le seul nom accessible du composant échappait au
// catalogue. Le composant n'importait pas `t`.
//
// Constat annexe (non corrigé ici, faute de décision produit) : aucun
// appelant ne passe `initialPlacement` — `DynamicBannerSlot` rend
// `<InAppPlacement slot fallback className />` — donc la branche placement
// n'est jamais atteinte dans le lecteur ; voir R136.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { tCalls, dismissed } = vi.hoisted(() => ({
  tCalls: [] as string[],
  dismissed: [] as string[],
}));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return `[${message}]`;
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    aside: ({ children, ...rest }: { children: React.ReactNode }) => (
      <aside {...rest}>{children}</aside>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@qoe/ui', () => ({
  InvertedCurveBanner: ({ message }: { message: string }) => (
    <div data-testid="notch">{message}</div>
  ),
}));

vi.mock('@qoe/flags', () => ({ useFlag: () => true }));

vi.mock('@/app/actions/placements', () => ({
  dismissPlacementAction: (id: string) => {
    dismissed.push(id);
    return Promise.resolve({ ok: true });
  },
}));

import { InAppPlacement } from '../InAppPlacement';
import type { InAppPlacementDTO } from '@/app/actions/placements';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Node 26 expose un `localStorage` global inutilisable sans
// `--localstorage-file` ; on installe le même stockage mémoire que les autres
// suites jsdom du dépôt.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

afterEach(() => {
  cleanup();
  tCalls.length = 0;
  dismissed.length = 0;
  vi.unstubAllGlobals();
});

const SOURCE = readFileSync(
  resolve(CORE_DIR, 'src/components/placements/InAppPlacement.tsx'),
  'utf-8'
);

const card: InAppPlacementDTO = {
  id: 'p1',
  type: 'info' as const,
  format: 'card' as const,
  title: 'Nouveauté',
  body: 'Le fil a changé.',
  ctaLabel: 'Voir',
  ctaUrl: '/feed',
  dismissible: true,
  slot: 'reader.feed.top',
  targetAudience: 'all',
  priority: 0,
  isActive: true,
} as InAppPlacementDTO;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('InAppPlacement — nom accessible du bouton de fermeture', () => {
  it('passe le libellé de fermeture par `t`', () => {
    render(<InAppPlacement slot="reader.feed.top" initialPlacement={card} />);

    expect(screen.getByRole('button', { name: '[Fermer cette notification]' })).toBeTruthy();
    expect(tCalls).toContain('Fermer cette notification');
  });

  it('acquitte localement puis côté serveur au clic', () => {
    render(<InAppPlacement slot="reader.feed.top" initialPlacement={card} />);

    fireEvent.click(screen.getByRole('button', { name: '[Fermer cette notification]' }));

    expect(document.querySelector('[data-placement-id="p1"]')).toBeNull();
    expect(dismissed).toEqual(['p1']);
  });
});

describe('InAppPlacement — stockage indisponible', () => {
  it('rend le bandeau même si `getItem` jette (navigation privée)', () => {
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('SecurityError');
      },
    });

    render(<InAppPlacement slot="reader.feed.top" initialPlacement={card} />);

    expect(screen.getByRole('button', { name: '[Fermer cette notification]' })).toBeTruthy();
  });
});

describe('InAppPlacement — garde de source', () => {
  it('n’écrit aucun aria-label français en dur', () => {
    expect(SOURCE).toContain("from '@lingui/core/macro'");
    expect(SOURCE).not.toMatch(/aria-label="/);
    expect(SOURCE).toContain('aria-label={t`Fermer cette notification`}');
  });
});

describe('InAppPlacement — branche placement inatteignable (R136)', () => {
  it('sans `initialPlacement`, ne rend que le repli', () => {
    render(<InAppPlacement slot="reader.feed.top" fallback={<div>repli</div>} />);

    expect(screen.getByText('repli')).toBeTruthy();
    expect(document.querySelector('[data-placement-id]')).toBeNull();
  });
});
