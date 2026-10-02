// =====================================================================
// 🧭 Stage editor models — souverains (équivalent @onlook/models minimal)
// =====================================================================

export enum StageEditorMode {
  DESIGN = 'design',
  PAN = 'pan',
  PREVIEW = 'preview',
}

export type StageLeftTab = 'layers' | 'brand' | 'pages' | 'blocks' | null;

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageFrameData {
  id: string;
  position: { x: number; y: number };
  dimension: { width: number; height: number };
}
