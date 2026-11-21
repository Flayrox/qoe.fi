// ⚠️ Sans `.env` local (CI, clone frais, worktree), la validation d'env client
// de `@qoe/config/env` (branche jsdom) échoue sur les `NEXT_PUBLIC_SUPABASE_*`.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'placeholder_anon_key';

import '@testing-library/jest-dom/vitest';

import { expect, vi } from 'vitest';

// @testing-library/jest-dom/vitest étend l'expect exporté. Avec globals:true,
// les tests utilisent l'expect GLOBAL : on l'étend aussi explicitement.
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
expect.extend(jestDomMatchers as Parameters<typeof expect.extend>[0]);

// scrollTo manquant dans jsdom (bouton docké de la vitrine).
Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });

// framer-motion (`whileInView`) exige IntersectionObserver, absent de jsdom.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: NoopIntersectionObserver,
  writable: true,
});

// Mock des macros Lingui pour les tests (le transformateur n'est pas appliqué
// par Vitest ici). t`Hello ${x}` → template string concaténé.
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
