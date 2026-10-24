import { vi } from 'vitest';

// jsdom ne fournit pas ResizeObserver, dont react-aria se sert pour mesurer
// les déclencheurs d'overlay : sans lui, un Popover reste fermé en test et
// l'assertion échoue pour une raison qui n'a rien à voir avec le composant.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

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
