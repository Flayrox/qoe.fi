// @vitest-environment jsdom
// =====================================================================
// 📊 ReadingProgressBar — la barre suit le bon conteneur, dès l'ouverture
// =====================================================================
// 📖 Deux défauts qu'une capture ne montre pas :
//    - la barre ne cherchait son conteneur qu'AU MONTAGE. Le plus souvent le
//      corps de l'article arrive après le shell : la barre s'accrochait donc
//      à la fenêtre et restait à 0 % pendant qu'on faisait défiler le corps ;
//    - la première mesure n'avait lieu qu'au premier défilement : en
//      arrivant au milieu d'un article, la barre annonçait 0 % jusqu'à ce
//      qu'on touche la molette.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { ReadingProgressBar } from '../ReadingProgressBar';

/** Fixe les métriques de défilement : jsdom n'en calcule aucune. */
function stubMetrics(
  element: HTMLElement,
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }
) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: metrics.clientHeight,
  });
  let scrollTop = metrics.scrollTop;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
}

function mountScroller(
  id: string,
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }
) {
  const scroller = document.createElement('div');
  scroller.id = id;
  document.body.appendChild(scroller);
  stubMetrics(scroller, metrics);
  return scroller;
}

/** Largeur peinte par la barre (l'enfant du conteneur rendu). */
function renderedWidth(container: HTMLElement): string {
  const fill = container.firstElementChild?.firstElementChild as HTMLElement | null;
  return fill?.style.width ?? '';
}

describe('ReadingProgressBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mesure le conteneur dès le montage, sans attendre un défilement', () => {
    mountScroller('article-scroller', { scrollTop: 50, scrollHeight: 200, clientHeight: 100 });

    const { container } = render(<ReadingProgressBar containerId="article-scroller" />);

    expect(renderedWidth(container)).toBe('50%');
  });

  it('s’accroche au conteneur même s’il est monté après la barre', () => {
    const { container } = render(<ReadingProgressBar containerId="article-late" />);
    expect(renderedWidth(container)).toBe('0%');

    const scroller = mountScroller('article-late', {
      scrollTop: 50,
      scrollHeight: 200,
      clientHeight: 100,
    });

    fireEvent.scroll(scroller);

    expect(renderedWidth(container)).toBe('50%');
  });

  it('retombe sur le défilement de la fenêtre quand aucun conteneur n’est demandé', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });

    const { container } = render(<ReadingProgressBar />);
    fireEvent.scroll(window);

    expect(renderedWidth(container)).toBe('50%');
  });
});
