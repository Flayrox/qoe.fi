// =====================================================================
// 📍 position — capturer et rendre la place exacte d'une page
// =====================================================================
// 📖 Partagé par toutes les surcouches (article, pensée). La page dessous
//    n'est jamais démontée, donc le scroll est préservé par construction ;
//    ces fonctions rattrapent les cas où le verrou de scroll du panneau ou
//    une revalidation décalent le contenu pendant l'ouverture.
//
// 🎯 On mémorise une ANCRE (l'élément marqué `data-overlay-anchor` en haut
//    de viewport), pas un offset en pixels : si la hauteur du contenu change,
//    une ancre retombe sur le bon contenu, un pixel non.
// =====================================================================

export interface BasePosition {
  /** Chemin + query + hash de la page sous la surcouche. */
  path: string;
  scrollY: number;
  anchorKey: string | null;
  anchorTop: number;
}

/** Ligne de sonde : sous les barres fixes, là où l'œil lit le contenu. */
const ANCHOR_PROBE = 96;

export function captureBase(): BasePosition {
  let anchorKey: string | null = null;
  let anchorTop = 0;

  const nodes = document.querySelectorAll<HTMLElement>('[data-overlay-anchor]');
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > ANCHOR_PROBE) {
      anchorKey = node.dataset.overlayAnchor ?? null;
      anchorTop = rect.top;
      break;
    }
  }

  return {
    path: window.location.pathname + window.location.search + window.location.hash,
    scrollY: window.scrollY,
    anchorKey,
    anchorTop,
  };
}

export function restorePosition(base: BasePosition): void {
  const run = () => {
    if (base.anchorKey) {
      const key = typeof CSS !== 'undefined' ? CSS.escape(base.anchorKey) : base.anchorKey;
      const node = document.querySelector<HTMLElement>(`[data-overlay-anchor="${key}"]`);
      if (node) {
        const delta = node.getBoundingClientRect().top - base.anchorTop;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
        return;
      }
    }
    if (Math.abs(window.scrollY - base.scrollY) > 1) {
      window.scrollTo({ top: base.scrollY, behavior: 'instant' });
    }
  };

  // Deux frames : la première laisse React retirer le verrou de scroll du
  // panneau, la seconde mesure une page stabilisée.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    run();
  }
}
