// =====================================================================
// 📄 canonical-document — Document canonique servi par le serveur
// =====================================================================
// Contrat partagé web/mobile : GET /v1/articles/{id}/document renvoie les
// blocs typographiques + le texte canonique plat + les offsets. Les
// surlignages portent canonicalStart/canonicalEnd (code points dans
// document.text) — plus aucune recherche de texte côté client.
// Les helpers ci-dessous sont PURS (aucun DOM) : testables unitairement.
// =====================================================================

import type { AnnotationItem } from './types';

export type CanonicalBlockKind =
  'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote' | 'code' | 'list' | 'img' | 'hr';

/** Style inline sur [start,end) du texte normalisé d'un bloc/item. */
export interface CanonicalInlineSpan {
  start: number;
  end: number;
  style: 'bold' | 'italic' | 'underline' | 'code' | 'link' | string;
  href?: string;
}

/** Marque officielle du créateur (mark data-annotation-note) sur [start,end). */
export interface CanonicalSpan {
  start: number;
  end: number;
  note?: string;
}

export interface CanonicalListItem {
  text: string;
  inline?: CanonicalInlineSpan[];
}

export interface CanonicalBlock {
  kind: CanonicalBlockKind;
  text?: string;
  items?: CanonicalListItem[];
  ordered?: boolean;
  src?: string;
  alt?: string;
  spans?: CanonicalSpan[];
  inline?: CanonicalInlineSpan[];
}

/** Segment mesurable : un bloc texte ou un item de liste. */
export interface CanonicalSegment {
  blockIdx: number;
  itemIdx: number;
  text: string;
  start: number;
  end: number;
}

export interface CanonicalDocument {
  blocks: CanonicalBlock[];
  segments: CanonicalSegment[];
  text: string;
  sha: string;
}

// ---------------------------------------------------------------------
// Marques par offsets (à peindre sur un bloc/item)
// ---------------------------------------------------------------------

export interface PaintMark {
  /** Offsets LOCAUX (code points dans le texte du bloc/item). */
  start: number;
  end: number;
  id: string;
  className: string;
  title?: string;
  annotation: AnnotationItem;
}

/**
 * Fenêtre globale [start,end) d'un segment (bloc ou item) dans le texte
 * canonique plat. null si le segment n'existe pas (document périmé).
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
 * Convertit une plage globale [gs,ge) en plage locale à la fenêtre.
 * Retourne null si la plage ne touche pas la fenêtre.
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

/** Points de découpe d'un texte de longueur len selon les marques. */
export function runBoundaries(len: number, marks: PaintMark[]): number[] {
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

/** Marques couvrant entièrement le run [a,b). */
export function marksCovering(marks: PaintMark[], a: number, b: number): PaintMark[] {
  return marks.filter((m) => m.start <= a && m.end >= b);
}

/** Découpe du texte en segments + styles inline actifs (helper pur). */
export interface StyleSegment {
  start: number;
  end: number;
  /** Styles actifs, ordre d'application (premier = englobant). */
  styles: string[];
  href?: string;
}

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
