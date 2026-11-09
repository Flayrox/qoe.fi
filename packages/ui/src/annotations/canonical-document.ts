// =====================================================================
// 📄 canonical-document — Document canonique servi par le serveur
// =====================================================================
// Contrat partagé web/mobile : GET /v1/articles/{id}/document renvoie les
// blocs typographiques + le texte canonique plat + les offsets. Les
// surlignages portent canonicalStart/canonicalEnd (code points dans
// document.text) — plus aucune recherche de texte côté client.
// Les helpers ci-dessous sont PURS (aucun DOM) : testables unitairement.
//
// ⚠️ Les TYPES du contrat vivent dans `@qoe/sdk` (source unique, partagée
// avec le mobile) — ré-exportés ici pour les consommateurs web existants.
// =====================================================================

import type {
  CanonicalBlock,
  CanonicalBlockKind,
  CanonicalDocument,
  CanonicalInlineSpan,
  CanonicalListItem,
  CanonicalSegment,
  CanonicalSpan,
} from '@qoe/sdk';
import type { AnnotationItem } from './types';

export type {
  CanonicalBlock,
  CanonicalBlockKind,
  CanonicalDocument,
  CanonicalInlineSpan,
  CanonicalListItem,
  CanonicalSegment,
  CanonicalSpan,
};

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

/**
 * Recherche l'occurrence n° `ordinal` (0-based) de `target` dans `docText`.
 * Repli sur la première occurrence si l'occurrence demandée n'est pas atteinte.
 * Retourne les offsets globaux [start, end) en code points, ou null si introuvable.
 */
export function findInDocText(
  docText: string,
  target: string,
  ordinal: number = 0
): { start: number; end: number } | null {
  if (!docText || !target) return null;
  const trimmed = target.trim();
  if (!trimmed) return null;
  let from = 0;
  let found = -1;
  let count = 0;
  while (true) {
    const idx = docText.indexOf(trimmed, from);
    if (idx === -1) break;
    if (count === ordinal) {
      found = idx;
      break;
    }
    count++;
    from = idx + 1;
  }
  if (found === -1 && count > 0) {
    found = docText.indexOf(trimmed);
  }
  if (found === -1) return null;
  return { start: found, end: found + trimmed.length };
}

/**
 * Rassemble toutes les annotations officielles (auteur) présentes dans un
 * document canonique. Associe les spans annotés à un item allPublic existant
 * s'il existe (même texte), ou produit une annotation synthétique.
 */
export function collectCanonicalAnnotations(
  doc: CanonicalDocument,
  allPublic: AnnotationItem[],
  creatorName: string
): AnnotationItem[] {
  const result: AnnotationItem[] = [];
  const usedPublic = new Set<string>();

  doc.blocks.forEach((block, blockIdx) => {
    const win = segmentWindow(doc, blockIdx, 0);
    const blockText = block.text ?? '';
    for (const sp of block.spans ?? []) {
      const text = blockText.slice(sp.start, sp.end);
      if (!text) continue;
      const matched = allPublic.find(
        (p) => p.isOfficial && p.text === text && !usedPublic.has(p.id)
      );
      if (matched) {
        usedPublic.add(matched.id);
        if (!result.some((a) => a.id === matched.id)) {
          result.push({
            ...matched,
            canonicalStart: matched.canonicalStart ?? (win ? win.start + sp.start : undefined),
            canonicalEnd: matched.canonicalEnd ?? (win ? win.start + sp.end : undefined),
          });
        }
      } else {
        const synth: AnnotationItem = {
          id: `official-html-mark-${blockIdx}-${sp.start}`,
          text,
          note: sp.note ?? null,
          isPublic: true,
          isOfficial: true,
          upvotesCount: 0,
          createdAt: new Date().toISOString(),
          reader: { id: 'creator', name: creatorName, username: 'creator', logoUrl: null },
          canonicalStart: win ? win.start + sp.start : undefined,
          canonicalEnd: win ? win.start + sp.end : undefined,
        };
        result.push(synth);
      }
    }
  });

  return result;
}
