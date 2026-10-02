// =====================================================================
// ⬢ OverlayManager + SnapManager — hover/click/measurement + guidelines
// Ref brute : vendor/onlook/_components/canvas/overlay/*
// =====================================================================

import { makeAutoObservable } from 'mobx';

export interface StageSnapLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number;
}

export class StageOverlayManager {
  hoverVisible = true;
  insertVisible = false;

  constructor() {
    makeAutoObservable(this);
  }

  clearUI() {
    this.insertVisible = false;
  }

  clear() {
    this.hoverVisible = true;
    this.insertVisible = false;
  }
}

export class StageSnapManager {
  activeSnapLines: StageSnapLine[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  setSnapLines(lines: StageSnapLine[]) {
    this.activeSnapLines = lines;
  }

  hideSnapLines() {
    this.activeSnapLines = [];
  }

  clear() {
    this.hideSnapLines();
  }
}
