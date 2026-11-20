// =====================================================================
// resize-math — géométrie des poignées de redimensionnement du Stage
// =====================================================================
// Extraite du handler pour être testable sans DOM : la poignée est (e)
// élargit en tirant vers la droite, la poignée ouest (w) en tirant vers la
// gauche. `maxWidth: 0` est la sentinelle « pleine largeur » de l'artboard.
// =====================================================================

export interface StyleBox {
  pt: number;
  pb: number;
  maxWidth: number;
}

const MIN_MAX_WIDTH = 320;
const MAX_PADDING = 240;

/**
 * Applique un déplacement de poignée (en pixels écran, déjà divisé par le
 * zoom) au `styleBox` d'un bloc.
 *
 * @param dir direction de la poignée : combinaison de `n`/`s` (vertical) et
 *   `e`/`w` (horizontal)
 * @param orig valeurs d'origine du bloc
 * @param delta déplacement souris en pixels canvas
 * @param deviceWidth largeur de l'artboard
 */
export function applyResize(
  dir: string,
  orig: StyleBox,
  delta: { dx: number; dy: number },
  deviceWidth: number
): StyleBox {
  const next: StyleBox = { ...orig };
  if (dir.includes('n')) next.pt = Math.max(0, Math.min(MAX_PADDING, orig.pt + delta.dy));
  if (dir.includes('s')) next.pb = Math.max(0, Math.min(MAX_PADDING, orig.pb + delta.dy));
  if (dir.includes('e') || dir.includes('w')) {
    // Est : tirer vers la droite élargit. Ouest : tirer vers la gauche élargit.
    const horizontal = dir.includes('e') ? delta.dx : -delta.dx;
    const base = orig.maxWidth || deviceWidth;
    next.maxWidth = Math.max(MIN_MAX_WIDTH, Math.min(deviceWidth, base + horizontal));
    if (next.maxWidth >= deviceWidth - 2) next.maxWidth = 0; // 0 = plein large
  }
  return next;
}
