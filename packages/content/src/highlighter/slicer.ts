// =====================================================================
// ✂️ highlighter/slicer.ts — Découpage non-destructif de marques & styles
// =====================================================================

import type { CanonicalInlineSpan } from '../canonical/types';
import { toLocalRange } from './segment-window';
import type { GenericPaintMark, SlicedMarkRun, StyleSegment } from './types';

/**
 * Calcule tous les points de découpe d'une plage [0, len] selon les marques actives.
 */
export function runBoundaries<T extends { start: number; end: number }>(
  len: number,
  marks: T[]
): number[] {
  const pts = new Set<number>([0, len]);
  for (const m of marks) {
    const s = Math.max(0, Math.min(len, m.start));
    const e = Math.max(0, Math.min(len, m.end));
    if (e > s) {
      pts.add(s);
      pts.add(e);
    }
  }
  return [...pts].sort((a, b) => a - b);
}

/**
 * Filtre les marques qui couvrent entièrement l'intervalle [a, b).
 */
export function marksCovering<T extends { start: number; end: number }>(
  marks: T[],
  a: number,
  b: number
): T[] {
  return marks.filter((m) => m.start <= a && m.end >= b);
}

/**
 * Découpe un intervalle de texte en segments de style homogènes.
 */
export function styleSegments(
  windowStart: number,
  windowEnd: number,
  inline: CanonicalInlineSpan[] | undefined
): StyleSegment[] {
  const pts = new Set<number>([windowStart, windowEnd]);
  for (const s of inline ?? []) {
    const a = Math.max(windowStart, s.start);
    const b = Math.min(windowEnd, s.end);
    if (b > a) {
      pts.add(a);
      pts.add(b);
    }
  }
  const sorted = [...pts].sort((x, y) => x - y);
  const out: StyleSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b <= a) continue;
    const active: string[] = [];
    let href: string | undefined;
    for (const s of inline ?? []) {
      if (s.start <= a && s.end >= b) {
        if (!active.includes(s.style)) active.push(s.style);
        if (s.style === 'link' && s.href) href = s.href;
      }
    }
    out.push({ start: a, end: b, styles: active, href });
  }
  return out;
}

/**
 * Découpe les marques globales traversant une fenêtre locale [windowStart, windowEnd)
 * en runs contigus avec la liste des marques actives par sous-intervalle.
 */
export function sliceMarksForSegment(
  globalMarks: GenericPaintMark[],
  windowStart: number,
  windowEnd: number
): SlicedMarkRun[] {
  const segmentLen = windowEnd - windowStart;
  if (segmentLen <= 0) return [];

  // 1. Projette les marques globales en marques locales à la fenêtre
  const localMarks: GenericPaintMark[] = [];
  for (const gm of globalMarks) {
    const loc = toLocalRange(windowStart, windowEnd, gm.start, gm.end);
    if (loc) {
      localMarks.push({
        ...gm,
        start: loc.start,
        end: loc.end,
      });
    }
  }

  // 2. Trouve toutes les frontières de découpe
  const boundaries = runBoundaries(segmentLen, localMarks);
  const runs: SlicedMarkRun[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i];
    const b = boundaries[i + 1];
    if (b <= a) continue;

    const active = marksCovering(localMarks, a, b);
    runs.push({
      start: a,
      end: b,
      activeMarks: active,
    });
  }

  return runs;
}
