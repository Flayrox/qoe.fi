// =====================================================================
// useStageHotkeys — raccourcis canvas
// =====================================================================

'use client';

import { useEffect } from 'react';
import { StageEditorMode } from '../engine/models';

interface HotkeyHandlers {
  editorMode: StageEditorMode;
  setEditorMode: (m: StageEditorMode) => void;
  undo: () => void;
  redo: () => void;
  resetZoom: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  setSpacePan: (v: boolean) => void;
  setShowMeasurement: (v: boolean) => void;
}

export function useStageHotkeys(h: HotkeyHandlers) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false);
      if (e.key === 'Alt') h.setShowMeasurement(true);
      if (typing) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        h.setSpacePan(true);
      }
      if (e.key === 'v' || e.key === 'V') h.setEditorMode(StageEditorMode.DESIGN);
      if (e.key === 'h' || e.key === 'H') h.setEditorMode(StageEditorMode.PAN);
      if (e.key === 'Escape') h.setEditorMode(StageEditorMode.DESIGN);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        h.undo();
      }
      if (
        (mod && e.key.toLowerCase() === 'y') ||
        (mod && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        h.redo();
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        h.duplicateSelected();
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !typing) {
        e.preventDefault();
        h.deleteSelected();
      }
      if (e.shiftKey && e.key === '0') {
        e.preventDefault();
        h.resetZoom();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') h.setShowMeasurement(false);
      if (e.code === 'Space') h.setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [h]);
}
