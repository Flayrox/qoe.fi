// @vitest-environment jsdom
// =====================================================================
// L21b — useStageHotkeys : raccourcis destructifs en mode Aperçu
// =====================================================================
// `StageCanvas` passe `editorMode` au hook, mais le hook ne le lisait
// **jamais** : en mode Aperçu, Suppr supprimait le bloc sélectionné du
// brouillon, ⌘D le dupliquait et ⌘Z annulait une modification — sans aucune
// indication à l'écran, puisque l'inspecteur et les poignées sont masqués.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StageEditorMode } from '../engine/models';
import { useStageHotkeys } from '../canvas/useStageHotkeys';

function Probe({ mode, handlers }: { mode: StageEditorMode; handlers: Record<string, unknown> }) {
  useStageHotkeys({
    editorMode: mode,
    setEditorMode: () => {},
    undo: () => {},
    redo: () => {},
    resetZoom: () => {},
    setSpacePan: () => {},
    setShowMeasurement: () => {},
    ...handlers,
  } as Parameters<typeof useStageHotkeys>[0]);
  return null;
}

function key(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
}

afterEach(() => cleanup());

describe('useStageHotkeys — mode Aperçu', () => {
  it('ne supprime, ne duplique et n’annule rien pendant l’aperçu', () => {
    const deleteSelected = vi.fn();
    const duplicateSelected = vi.fn();
    const undo = vi.fn();

    render(
      <Probe
        mode={StageEditorMode.PREVIEW}
        handlers={{ deleteSelected, duplicateSelected, undo }}
      />
    );

    key({ key: 'Delete' });
    key({ key: 'Backspace' });
    key({ key: 'd', metaKey: true });
    key({ key: 'z', metaKey: true });

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(duplicateSelected).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('garde les raccourcis complets en mode Design', () => {
    const deleteSelected = vi.fn();
    const duplicateSelected = vi.fn();

    render(
      <Probe mode={StageEditorMode.DESIGN} handlers={{ deleteSelected, duplicateSelected }} />
    );

    key({ key: 'Delete' });
    key({ key: 'd', metaKey: true });

    expect(deleteSelected).toHaveBeenCalledTimes(1);
    expect(duplicateSelected).toHaveBeenCalledTimes(1);
  });
});
