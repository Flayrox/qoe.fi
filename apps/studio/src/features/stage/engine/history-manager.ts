// =====================================================================
// 🕰️ HistoryManager — undo/redo transactionnel (adapté d'Onlook HistoryManager)
// Ref brute : vendor/onlook/store/editor/history/index.ts
// Diff : snapshots LayoutConfig JSON au lieu d'Actions code, avec transactions
// pour drag/resize/typing (évite spam 1 keystroke = 1 entrée).
// =====================================================================

import { makeAutoObservable } from 'mobx';
import type { LayoutConfig } from '@qoe/ui/templates';

function cloneLayout(layout: LayoutConfig): LayoutConfig {
  return JSON.parse(JSON.stringify(layout)) as LayoutConfig;
}

export class StageHistoryManager {
  private undoStack: LayoutConfig[] = [];
  private redoStack: LayoutConfig[] = [];
  private transactionStart: LayoutConfig | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get length(): number {
    return this.undoStack.length;
  }

  /** Snapshot simple (borné à 50) — usage hors drag/typing */
  push(previous: LayoutConfig) {
    if (this.transactionStart) return; // en transaction, on commit à la fin
    this.undoStack = [...this.undoStack.slice(-49), cloneLayout(previous)];
    this.redoStack = [];
  }

  startTransaction(current: LayoutConfig) {
    if (!this.transactionStart) {
      this.transactionStart = cloneLayout(current);
    }
  }

  commitTransaction() {
    if (!this.transactionStart) return;
    this.undoStack = [...this.undoStack.slice(-49), this.transactionStart];
    this.transactionStart = null;
    this.redoStack = [];
  }

  cancelTransaction() {
    this.transactionStart = null;
  }

  undo(current: LayoutConfig): LayoutConfig | null {
    this.commitTransactionIfAny();
    const top = this.undoStack.pop();
    if (!top) return null;
    this.redoStack = [cloneLayout(current), ...this.redoStack];
    return top;
  }

  redo(current: LayoutConfig): LayoutConfig | null {
    const next = this.redoStack.shift();
    if (!next) return null;
    this.undoStack = [...this.undoStack, cloneLayout(current)];
    return next;
  }

  private commitTransactionIfAny() {
    if (this.transactionStart) this.commitTransaction();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.transactionStart = null;
  }
}
