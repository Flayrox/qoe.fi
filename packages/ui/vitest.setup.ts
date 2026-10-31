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

// jsdom n'implémente pas le défilement : `Element.scrollIntoView` n'existe
// pas du tout. Les composants qui recentrent la marque active (tiroir
// d'annotation, deep-link de citation) lèvent alors un TypeError au montage
// d'un effet — un échec de test qui ne dit rien du composant.
// Certains fichiers de test tournent en environnement `node` (helpers purs) :
// là, `Element` n'existe pas du tout.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}

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
