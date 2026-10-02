// =====================================================================
// 🎭 StageEditorEngine — double-moteur temps réel (mobx éphémère)
// Inspiré d'Onlook EditorEngine (vendor/onlook/store/editor/engine.ts:33-79)
// Souverain : pas de projectId/posthog/trpc/sandbox/iframe — canvas + sélection
// + overlay + history pour LayoutConfig JSON. La persistance reste dans
// StageEngineContext (PATCH /api/settings/publication).
// =====================================================================

import { makeAutoObservable } from 'mobx';
import { StageCanvasManager } from './canvas-manager';
import { StageStateManager } from './state-manager';
import { StageFramesManager } from './frames-manager';
import { StageHistoryManager } from './history-manager';
import { StageOverlayManager, StageSnapManager } from './overlay-managers';

export class StageEditorEngine {
  readonly canvas: StageCanvasManager = new StageCanvasManager();
  readonly state: StageStateManager = new StageStateManager();
  readonly frames: StageFramesManager = new StageFramesManager();
  readonly history: StageHistoryManager = new StageHistoryManager();
  readonly overlay: StageOverlayManager = new StageOverlayManager();
  readonly snap: StageSnapManager = new StageSnapManager();

  constructor() {
    makeAutoObservable(this);
  }

  clear() {
    this.frames.clear();
    this.overlay.clear();
    this.canvas.clear();
    this.state.clear();
    this.history.clear();
    this.snap.clear();
  }

  clearUI() {
    this.overlay.clearUI();
    this.frames.deselectAll();
    this.frames.setHover(null);
    this.snap.hideSnapLines();
  }
}
