// =====================================================================
// 🎛️ CanvasManager — temps réel mobx (adapté d'Onlook CanvasManager)
// Ref brute : vendor/onlook/store/editor/canvas/index.ts
// Diff souveraine : pas de trpc/api, pas de lodash, pas de DB, clamp souverain.
// =====================================================================

import { makeAutoObservable } from 'mobx';
import {
  STAGE_DEFAULT_POSITION,
  STAGE_DEFAULT_SCALE,
  clampStagePosition,
  clampStageZoom,
} from './constants';

export class StageCanvasManager {
  private _scale: number = STAGE_DEFAULT_SCALE;
  private _position: { x: number; y: number } = { ...STAGE_DEFAULT_POSITION };

  constructor() {
    makeAutoObservable(this);
  }

  get scale(): number {
    return this._scale;
  }

  set scale(value: number) {
    this._scale = clampStageZoom(value);
  }

  get position(): { x: number; y: number } {
    return this._position;
  }

  set position(value: { x: number; y: number }) {
    this._position = clampStagePosition(value, this._scale);
  }

  zoomBy(factor: number, anchor?: { x: number; y: number }) {
    const nextScale = clampStageZoom(this._scale * factor);
    if (anchor) {
      const ratio = nextScale / this._scale;
      this._position = clampStagePosition(
        {
          x: anchor.x - (anchor.x - this._position.x) * ratio,
          // Compensation drift type Onlook (top-bar 40px + badge)
          y: anchor.y - (anchor.y - this._position.y) * ratio,
        },
        nextScale
      );
    }
    this._scale = nextScale;
  }

  zoomIn() {
    this.scale = this._scale * 1.2;
  }

  zoomOut() {
    this.scale = this._scale * 0.8;
  }

  panBy(dx: number, dy: number) {
    this.position = {
      x: this._position.x + dx,
      y: this._position.y + dy,
    };
  }

  reset() {
    this._scale = STAGE_DEFAULT_SCALE;
    this._position = { ...STAGE_DEFAULT_POSITION };
  }

  clear() {
    this.reset();
  }
}
