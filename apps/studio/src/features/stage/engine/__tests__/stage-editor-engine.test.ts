// =====================================================================
// L21b — StageEditorEngine : un seul propriétaire par état
// =====================================================================
// Le portage d'Onlook a apporté quatre managers mobx (canvas, history,
// overlay, snap) que **personne n'appelait** : `editor.canvas`, `.history`,
// `.overlay` et `.snap` avaient 0 consommateur dans `features/stage` (le zoom,
// l'historique et l'affichage des overlays vivent dans `StageEngineContext`).
// Deux historiques, deux propriétaires du zoom, aucun effet : le second
// implémentation était morte et trompait la lecture du code.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { StageEditorEngine } from '../stage-editor-engine';

describe('StageEditorEngine', () => {
  it('n’expose que les managers réellement consommés', () => {
    expect(Object.keys(new StageEditorEngine()).sort()).toEqual(['frames', 'state']);
  });

  it('efface sélection, survol et rects au clear', () => {
    const engine = new StageEditorEngine();
    engine.frames.select('bloc-1');
    engine.frames.setHover('bloc-1');
    engine.frames.registerRect('bloc-1', { x: 0, y: 0, width: 10, height: 10 });
    engine.state.canvasScrolling = true;

    engine.clear();

    expect(engine.frames.selected).toEqual([]);
    expect(engine.frames.hoveredId).toBeNull();
    expect(engine.frames.getRect('bloc-1')).toBeUndefined();
    expect(engine.state.canvasScrolling).toBe(false);
  });
});
