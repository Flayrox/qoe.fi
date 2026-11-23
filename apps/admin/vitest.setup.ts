import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}

// Macros Lingui : les composants du design system (`ConfirmDialog`, `Dialog`)
// les portent. Aucun autre paquet ne les compile en test, donc on rend le
// gabarit tel quel — même stub que `apps/studio/vitest.setup.ts`.
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') return strings;
    return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
  },
  msg: (strings: TemplateStringsArray) => strings[0] ?? '',
}));
