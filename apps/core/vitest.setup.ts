import { afterEach, vi } from 'vitest';

// Cleanup global des arbres React montés par les tests jsdom.
//
// Sans lui, les composants restent montés après la fin du fichier : le
// scheduler de React peut exécuter une tâche différée une fois l'environnement
// jsdom détruit, ce qui produit des `ReferenceError: window is not defined`
// remontés en « unhandled errors » et font échouer tout le gate de couverture
// (flake observé en CI sur `AppSidebar.test.tsx`).
// `@testing-library/react` est importé paresseusement : les tests en
// environnement `node` de ce paquet ne doivent pas le charger.
if (typeof window !== 'undefined') {
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  });
}

// jsdom ne fournit pas ResizeObserver, dont react-aria se sert pour mesurer
// les déclencheurs d'overlay : sans lui, les onglets restent fermés en test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}

if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
}

// Les macros Lingui ne sont pas transformées par Vitest dans apps/core.
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
