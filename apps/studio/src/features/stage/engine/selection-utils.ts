// =====================================================================
// 🎯 selection-utils — portage souverain de vendor/canvas/selection-utils.ts
// Conversion (sel-pos)/scale + test intersection, sans EditorEngine iframe.
// =====================================================================

import type { StageEditorEngine } from './stage-editor-engine';

export function getStageIdsInSelection(
  engine: StageEditorEngine,
  start: { x: number; y: number },
  end: { x: number; y: number }
): string[] {
  return engine.frames.getIdsInSelection(start, end, engine.canvas.position, engine.canvas.scale);
}
