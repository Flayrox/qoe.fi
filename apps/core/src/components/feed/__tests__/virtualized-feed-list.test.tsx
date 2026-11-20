// @vitest-environment jsdom
// =====================================================================
// L20c5 — liste virtualisée du fil : garanties écrites AVANT correctif
// =====================================================================
// 1. Le `scrollMargin` du virtualizer est lu pendant le rendu
//    (`parentRef.current?.offsetTop`), donc toujours `0` au premier passage
//    et jamais re-mesuré : les lignes sont décalées de la hauteur de l'en-tête
//    et le total de scroll ne correspond pas au contenu.
// 2. `new IntersectionObserver(...)` est instancié sans garde : tout
//    environnement qui n'en dispose pas (jsdom, WebView ancienne) jette au
//    montage et fait tomber le fil entier au lieu de dégrader le défilement.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { capturedMargins } = vi.hoisted(() => ({
  capturedMargins: [] as unknown[],
}));

vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: (options: { scrollMargin?: number }) => {
    capturedMargins.push(options.scrollMargin);
    return {
      options,
      getVirtualItems: () => [],
      getTotalSize: () => 0,
      measureElement: () => {},
    };
  },
}));

import { VirtualizedFeedList } from '../VirtualizedFeedList';

const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');

beforeEach(() => {
  capturedMargins.length = 0;
  cleanup();
});

afterEach(() => {
  if (originalOffsetTop) {
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', originalOffsetTop);
  }
});

describe('VirtualizedFeedList — pagination et géométrie', () => {
  it('monte sans `IntersectionObserver` au lieu de jeter', () => {
    expect(typeof IntersectionObserver).toBe('undefined');

    expect(() =>
      render(
        <VirtualizedFeedList
          items={[{ id: 'a' }, { id: 'b' }]}
          renderItem={(item) => <p>{item.id}</p>}
          fetchNextPage={vi.fn()}
          hasNextPage
        />
      )
    ).not.toThrow();
    // La sentinelle de pagination est montée : le chemin qui instanciait
    // `IntersectionObserver` a bien été parcouru, sans jeter.
    expect(document.querySelector('div.h-8')).toBeTruthy();
  });

  it('re-mesure le `scrollMargin` après le montage', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get: () => 120,
    });

    render(
      <VirtualizedFeedList
        items={[{ id: 'a' }]}
        renderItem={(item) => <p>{item.id}</p>}
        fetchNextPage={vi.fn()}
        hasNextPage
      />
    );

    // La première passe lit `null?.offsetTop` (le ref n'existe pas encore) :
    // c'est la mesure d'après montage qui doit atteindre le virtualizer.
    expect(capturedMargins).toContain(120);
  });

  it('ne rend pas la sentinelle quand il n’y a plus de page', () => {
    const { container } = render(
      <VirtualizedFeedList items={[{ id: 'a' }]} renderItem={(item) => <p>{item.id}</p>} />
    );

    expect(container.querySelectorAll('div.h-8')).toHaveLength(0);
  });
});
