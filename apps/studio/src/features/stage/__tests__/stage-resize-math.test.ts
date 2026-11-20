// =====================================================================
// L21b — géométrie des poignées de redimensionnement
// =====================================================================
// Le handler calculait `const delta = dir.includes('e') ? -dx : -dx` : les
// deux branches identiques, donc tirer la poignée **est** vers la droite
// rétrécissait le bloc (600 → 500 au lieu de 700).
// =====================================================================

import { describe, expect, it } from 'vitest';
import { applyResize } from '../canvas/resize-math';

const ORIG = { pt: 0, pb: 0, maxWidth: 600 };

describe('applyResize — horizontal', () => {
  it('élargit avec la poignée est quand on tire vers la droite', () => {
    expect(applyResize('e', ORIG, { dx: 100, dy: 0 }, 1280).maxWidth).toBe(700);
  });

  it('élargit avec la poignée ouest quand on tire vers la gauche', () => {
    expect(applyResize('w', ORIG, { dx: -100, dy: 0 }, 1280).maxWidth).toBe(700);
  });

  it('rétrécit dans le sens inverse, sans descendre sous 320 px', () => {
    expect(applyResize('e', ORIG, { dx: -100, dy: 0 }, 1280).maxWidth).toBe(500);
    expect(applyResize('e', ORIG, { dx: -9999, dy: 0 }, 1280).maxWidth).toBe(320);
  });

  it('reprend la sentinelle « pleine largeur » au-delà de l’artboard', () => {
    expect(applyResize('e', ORIG, { dx: 900, dy: 0 }, 1280).maxWidth).toBe(0);
  });
});

describe('applyResize — vertical', () => {
  it('borne les marges haut et bas à 240 px', () => {
    expect(applyResize('n', ORIG, { dx: 0, dy: 40 }, 1280).pt).toBe(40);
    expect(applyResize('n', ORIG, { dx: 0, dy: -40 }, 1280).pt).toBe(0);
    expect(applyResize('s', ORIG, { dx: 0, dy: 400 }, 1280).pb).toBe(240);
  });
});
