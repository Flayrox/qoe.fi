import '@testing-library/jest-dom/vitest';

// Polyfills jsdom pour les libs qui les attendent
import { vi } from 'vitest';

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
