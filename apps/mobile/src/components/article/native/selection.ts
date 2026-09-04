// =====================================================================
// 🎯 selection.ts — Sélection NATIVE → SelectionInfo (C1)
// =====================================================================
// Le conteneur texte natif (UITextView / TextView) signale une sélection
// en offsets UTF-16 (NSRange / selectionStart+selectionEnd). Ce module la
// convertit en ce que la surface morphée (SelectionPopover) et l'API
// attendent — exactement la sémantique de selectionToInfo (html-blocks) :
//   - text : extrait canonique du passage (blancs normalisés du doc) ;
//   - index : ordinal canonique (nombre d'occurrences du texte entièrement
//     avant l'offset — même sémantique que `CountBefore` Go) ;
//   - canonicalStart/End : ancre en code points dans doc.text.
// Les caractères synthétiques (retours de paragraphe, puces, attachments)
// sont exclus du texte cité.
// =====================================================================

import { canonicalSlice, displayRangeToCanonical, type ArticleTextModel } from './article-text';

export interface NativeSelectionInfo {
  text: string;
  index: number;
  canonicalStart: number;
  canonicalEnd: number;
}

/**
 * Nombre d'occurrences de `needle` (normalisé) entièrement avant
 * `start` (offset canonique en code points) dans doc.text — miroir de
 * `ordinalAt(basis, needle, needleStart)` / `CountBefore` Go.
 */
function ordinalBefore(text: string, needle: string, start: number): number {
  if (!needle) return 0;
  const norm = needle.replace(/\s+/g, ' ').trim();
  if (!norm) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const i = text.indexOf(norm, from);
    if (i === -1 || i >= start) break;
    count++;
    from = i + norm.length;
  }
  return count;
}

/**
 * Convertit une sélection native [a,b) UTF-16 en SelectionInfo natif.
 * Retourne null si la plage ne couvre aucun caractère réel (tap de
 * désélection, sélection d'un simple retour de paragraphe…).
 */
export function nativeSelectionToInfo(
  model: ArticleTextModel,
  a: number,
  b: number
): NativeSelectionInfo | null {
  const range = displayRangeToCanonical(model, a, b);
  if (!range) return null;
  const text = canonicalSlice(model, range.start, range.end);
  if (!text.trim()) return null;
  return {
    text,
    index: ordinalBefore(model.doc.text, text, range.start),
    canonicalStart: range.start,
    canonicalEnd: range.end,
  };
}
