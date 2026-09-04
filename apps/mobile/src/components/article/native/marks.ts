// =====================================================================
// 🖌️ marks.ts — Marques à peindre sur le texte natif (C1)
// =====================================================================
// Réunit TOUTES les sources de surlignage en plages d'affichage continues
// (code points du texte plat de article-text.ts), prêtes à devenir des
// BackgroundColorSpan / NSAttributedString backgroundColor :
//   - marques officielles du document (spans du créateur) ;
//   - surlignages ancrés (canonicalStart/canonicalEnd, sha conforme) —
//     privés / publics / officiels selon les flags ;
//   - spotlight du deep-link (6-b/6-d, sha conforme).
// Les synthétiques ne sont inclus que s'ils sont INTERNES à une marque
// (bande continue multi-blocs, comme le <mark> web).
// =====================================================================

import {
  canonicalToDisplayCpRange,
  cpToUtf16,
  type ArticleTextModel,
  type NativeMark,
} from './article-text';

/** Entrée de surlignage (même forme minimale qu'ArticleHtml aujourd'hui). */
export interface MarkHighlightInput {
  text?: string | null;
  quoteOrdinal?: number;
  canonicalStart?: number;
  canonicalEnd?: number;
  isOfficial?: boolean;
  isPublic?: boolean;
  contentSha?: string;
}

export interface NativeMarksInput {
  highlights?: (MarkHighlightInput | null | undefined)[];
  spotlight?: { start: number; end: number; sha: string } | null;
}

/**
 * Construit les plages d'affichage (code points) de toutes les marques.
 * Surlignages/spotlight non ancrés ou à sha périmé → ignorés (un contenu
 * ré-édité ne produit jamais de faux surlignage).
 */
export function buildNativeMarks(model: ArticleTextModel, input: NativeMarksInput): NativeMark[] {
  const out: NativeMark[] = [...model.officialMarks];

  const pushCanonical = (kind: NativeMark['kind'], cs: number, ce: number, sha?: string | null) => {
    if (typeof cs !== 'number' || typeof ce !== 'number' || !(ce > cs)) return;
    if (sha && sha !== model.doc.sha) return; // empreinte périmée
    const r = canonicalToDisplayCpRange(model, cs, ce);
    if (!r) return;
    out.push({ kind, startCp: r.startCp, endCp: r.endCp });
  };

  for (const hl of input.highlights ?? []) {
    if (!hl) continue;
    if (typeof hl.canonicalStart !== 'number' || typeof hl.canonicalEnd !== 'number') continue;
    const kind: NativeMark['kind'] = hl.isOfficial
      ? 'official'
      : hl.isPublic
        ? 'public'
        : 'private';
    pushCanonical(kind, hl.canonicalStart, hl.canonicalEnd, hl.contentSha);
  }

  if (input.spotlight) {
    pushCanonical('spotlight', input.spotlight.start, input.spotlight.end, input.spotlight.sha);
  }

  return out;
}

/** Plage en UTF-16 du texte d'affichage (prête pour NSRange/Spannable). */
export interface DisplayMarkRange {
  kind: NativeMark['kind'];
  start: number;
  end: number;
}

/** Convertit une marque (code points d'affichage) en plage UTF-16. */
export function markToDisplayRange(model: ArticleTextModel, mark: NativeMark): DisplayMarkRange {
  return {
    kind: mark.kind,
    start: cpToUtf16(model.text, mark.startCp),
    end: cpToUtf16(model.text, mark.endCp),
  };
}

/** Convenance : toutes les marques directement en plages UTF-16. */
export function buildDisplayRanges(
  model: ArticleTextModel,
  input: NativeMarksInput
): DisplayMarkRange[] {
  return buildNativeMarks(model, input).map((m) => markToDisplayRange(model, m));
}
