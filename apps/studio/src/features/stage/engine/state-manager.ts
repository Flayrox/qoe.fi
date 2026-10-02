// =====================================================================
// 🧠 StateManager — mode/overlay/pan (adapté d'Onlook StateManager)
// Ref brute : vendor/onlook/store/editor/state/index.ts
// =====================================================================

import { makeAutoObservable } from 'mobx';
import { StageEditorMode, type StageLeftTab } from './models';

export class StageStateManager {
  editorMode: StageEditorMode = StageEditorMode.DESIGN;
  leftPanelTab: StageLeftTab = 'layers';
  leftPanelLocked = true;

  canvasScrolling = false;
  canvasPanning = false;
  isDragSelecting = false;
  showMeasurement = false;

  private _scrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get shouldHideOverlay(): boolean {
    return this.canvasScrolling || this.canvasPanning;
  }

  setCanvasScrolling(value: boolean) {
    this.canvasScrolling = value;
    if (value) {
      if (this._scrollResetTimer) clearTimeout(this._scrollResetTimer);
      this._scrollResetTimer = setTimeout(() => {
        this.canvasScrolling = false;
      }, 150);
    }
  }

  clear() {
    this.editorMode = StageEditorMode.DESIGN;
    this.canvasScrolling = false;
    this.canvasPanning = false;
    this.isDragSelecting = false;
    this.showMeasurement = false;
    if (this._scrollResetTimer) clearTimeout(this._scrollResetTimer);
  }
}
