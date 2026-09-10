// =====================================================================
// 🔍 highlighter/segment-window.ts — Résolution de fenêtre de segment
// =====================================================================

import type { CanonicalDocument } from '../canonical/types';

/**
 * Retourne la fenêtre globale [start, end) en code points d'un segment dans doc.text.
 * Retourne null si le segment n'existe pas.
 */
export function segmentWindow(
  doc: CanonicalDocument,
  blockIdx: number,
  itemIdx: number
): { start: number; end: number } | null {
  const seg = doc.segments.find((s) => s.blockIdx === blockIdx && s.itemIdx === itemIdx);
  if (!seg) return null;
  return { start: seg.start, end: seg.end };
}

/**
 * Convertit une plage globale [gs, ge) en plage locale [start, end) relative à la fenêtre.
 * Retourne null si la plage globale ne chevauche pas la fenêtre.
 */
export function toLocalRange(
  windowStart: number,
  windowEnd: number,
  gs: number,
  ge: number
): { start: number; end: number } | null {
  const start = Math.max(gs, windowStart);
  const end = Math.min(ge, windowEnd);
  if (end <= start) return null;
  return { start: start - windowStart, end: end - windowStart };
}
