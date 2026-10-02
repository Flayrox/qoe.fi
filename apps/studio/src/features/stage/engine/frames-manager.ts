// =====================================================================
// 🗂️ FramesManager — sélection blocs + hover + multi-select (adapté Onlook)
// Ref brute : vendor/onlook/store/editor/frames/manager.ts + canvas/selection-utils.ts
// Diff : Map<blockId, rect DOM> au lieu de FrameData iframe/penpal.
// =====================================================================

import { makeAutoObservable } from 'mobx';
import type { StageRect } from './models';

export class StageFramesManager {
  selectedIds: string[] = [];
  hoveredId: string | null = null;

  /** Rects mesurés depuis le DOM (data-block-id) — remplace frame.position/dimension */
  private rects = new Map<string, StageRect>();

  constructor() {
    makeAutoObservable(this);
  }

  get selected(): string[] {
    return this.selectedIds;
  }

  get singleSelected(): string | null {
    return this.selectedIds.length === 1 ? this.selectedIds[0] : null;
  }

  select(id: string | null, additive = false) {
    if (!id) {
      this.selectedIds = [];
      return;
    }
    if (additive) {
      this.selectedIds = this.selectedIds.includes(id)
        ? this.selectedIds.filter((s) => s !== id)
        : [...this.selectedIds, id];
      return;
    }
    this.selectedIds = [id];
  }

  selectMany(ids: string[]) {
    this.selectedIds = ids;
  }

  deselectAll() {
    this.selectedIds = [];
  }

  setHover(id: string | null) {
    this.hoveredId = id;
  }

  registerRect(id: string, rect: StageRect) {
    this.rects.set(id, rect);
  }

  clearRects() {
    this.rects.clear();
  }

  getRect(id: string): StageRect | undefined {
    return this.rects.get(id);
  }

  /** Portage de getFramesInSelection — conversion (sel-pos)/scale + test intersection */
  getIdsInSelection(
    start: { x: number; y: number },
    end: { x: number; y: number },
    canvasPos: { x: number; y: number },
    scale: number
  ): string[] {
    const x1 = (Math.min(start.x, end.x) - canvasPos.x) / scale;
    const y1 = (Math.min(start.y, end.y) - canvasPos.y) / scale;
    const x2 = (Math.max(start.x, end.x) - canvasPos.x) / scale;
    const y2 = (Math.max(start.y, end.y) - canvasPos.y) / scale;
    const out: string[] = [];
    for (const [id, r] of this.rects) {
      const intersects = r.x < x2 && r.x + r.width > x1 && r.y < y2 && r.y + r.height > y1;
      if (intersects) out.push(id);
    }
    return out;
  }

  clear() {
    this.selectedIds = [];
    this.hoveredId = null;
    this.rects.clear();
  }
}
