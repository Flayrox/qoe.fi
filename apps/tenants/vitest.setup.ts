// ⚠️ Sans `.env` local (CI, clone frais, worktree), la validation d'env client
// de `@qoe/config/env` (branche jsdom) échoue sur les `NEXT_PUBLIC_SUPABASE_*`.
// Mêmes fallbacks que `vitest.workspace.ts` au niveau monorepo : les vraies
// valeurs du `.env` restent prioritaires quand le fichier est présent.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder_anon_key';

import '@testing-library/jest-dom/vitest';

// Polyfills jsdom pour les libs qui les attendent
import { expect, vi } from 'vitest';

// @testing-library/jest-dom/vitest étend l'expect exporté. Avec globals:true,
// les tests utilisent l'expect GLOBAL : on l'étend aussi explicitement pour
// garantir toBeInTheDocument etc. (évite la collision de contextes vitest).
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
expect.extend(jestDomMatchers as Parameters<typeof expect.extend>[0]);

// Les composants utilisent window.location pour les redirects de login
Object.defineProperty(window, 'location', {
  value: { ...window.location, href: 'https://test.qoe.fi/article/test' },
  writable: true,
});

// scrollTo manquant dans jsdom
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

// Mock des macros Lingui pour les tests (le transformateur Babel n'est pas
// appliqué par Vitest ici). t`Hello ${x}` → template string concaténé.
vi.mock('@lingui/core/macro', () => {
  const t = (strings: TemplateStringsArray, ...values: unknown[]): string =>
    strings.reduce(
      (acc, str, i) => acc + str + (values[i] !== undefined ? String(values[i]) : ''),
      ''
    );
  return { t };
});

vi.mock('@lingui/react/macro', () => {
  const coreMacro = vi.importActual('@lingui/core/macro') as unknown as {
    t: (strings: TemplateStringsArray, ...values: unknown[]) => string;
  };
  return {
    t: coreMacro.t,
    Trans: ({ children }: { children: React.ReactNode }) => children,
  };
});
