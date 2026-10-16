import { vi } from 'vitest';

// Mock des macros Lingui pour les tests (le transformateur Babel/SWC n'est pas
// appliqué par Vitest dans packages/ui). t`Hello ${x}` → template string concaténé.
vi.mock('@lingui/core/macro', () => {
  const t = (strings: TemplateStringsArray | string, ...values: unknown[]): string => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (acc, str, i) => acc + str + (values[i] !== undefined ? String(values[i]) : ''),
        ''
      );
    }
    return String(strings || '');
  };
  return { t };
});
