// =====================================================================
// StageEditorEngine — moteur temps réel (mobx éphémère)
// Inspiré d'Onlook EditorEngine (vendor/onlook/store/editor/engine.ts:33-79)
// Souverain : pas de projectId/posthog/trpc/sandbox/iframe.
// Le moteur ne porte que ce que le DOM ne peut pas donner : la sélection et
// les rects mesurés (`frames`) et l'état d'interaction du canvas (`state`).
// Le zoom/pan et l'historique vivent dans `StageEngineContext` : les managers
// mobx correspondants du portage n'avaient aucun consommateur (supprimés en
// L21b pour ne pas laisser deux propriétaires du même état).
// =====================================================================

import { makeAutoObservable } from 'mobx';
import { StageStateManager } from './state-manager';
import { StageFramesManager } from './frames-manager';

export class StageEditorEngine {
  readonly state: StageStateManager = new StageStateManager();
  readonly frames: StageFramesManager = new StageFramesManager();

  constructor() {
    makeAutoObservable(this);
  }

  clear() {
    this.frames.clear();
    this.state.clear();
  }
}
