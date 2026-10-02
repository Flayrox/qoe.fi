// =====================================================================
// 🧭 Stage engine — constantes canvas (portées d'Onlook, souveraines)
// Source brute : stage/vendor/onlook/_components/canvas/index.tsx:17-24
// =====================================================================

export const STAGE_ZOOM_SENSITIVITY = 0.006;
export const STAGE_PAN_SENSITIVITY = 0.52;
export const STAGE_MIN_ZOOM = 0.1;
export const STAGE_MAX_ZOOM = 3;
export const STAGE_MAX_X = 10000;
export const STAGE_MAX_Y = 10000;
export const STAGE_MIN_X = -5000;
export const STAGE_MIN_Y = -5000;

export const STAGE_DEFAULT_SCALE = 0.95;
export const STAGE_DEFAULT_POSITION = { x: 60, y: 20 } as const;

export function clampStageZoom(scale: number): number {
  return Math.min(Math.max(scale, STAGE_MIN_ZOOM), STAGE_MAX_ZOOM);
}

export function clampStagePosition(
  pos: { x: number; y: number },
  scale: number
): { x: number; y: number } {
  const maxX = STAGE_MAX_X * scale;
  const maxY = STAGE_MAX_Y * scale;
  const minX = STAGE_MIN_X * scale;
  const minY = STAGE_MIN_Y * scale;
  return {
    x: Math.min(Math.max(pos.x, minX), maxX),
    y: Math.min(Math.max(pos.y, minY), maxY),
  };
}
