// =====================================================================
// ⚓ anchors.ts — Calcul d'ancrage canonique des surlignages (Miroir Go)
// =====================================================================

import type { CanonicalDocument } from './types';

/** Génère un identifiant local unique (préfixe `local-` pour ne pas collisionner). */
export function makeLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalise un texte comme le serveur (`canon.Normalize`) :
 * les séquences d'espaces blancs (espaces, tabs, sauts de ligne, NBSP…)
 * deviennent un espace unique, bordures trimées.
 */
export function normalizeCanonical(s: string): string {
  let out = '';
  let prevSpace = true; // → trim des blancs de tête
  for (const ch of s) {
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      prevSpace = true;
      out += ' ';
    } else {
      prevSpace = false;
      out += ch;
    }
  }
  return out.trim();
}

/**
 * Localise l'occurrence n° `quoteOrdinal` (0-based) de `target` dans le
 * texte canonique `doc.text`. Retourne les offsets [start, end) en CODE
 * POINTS (comme le serveur) — ou null si introuvable.
 *
 * Miroir fidèle de `canon.(*Document).Find` (Go) :
 * même normalisation, même recherche ordinale sans chevauchement, même
 * repli sur la première occurrence quand l'ordinal dépasse le compte.
 */
export function computeLocalAnchors(
  doc: Pick<CanonicalDocument, 'text'>,
  target: string,
  quoteOrdinal: number = 0
): { start: number; end: number } | null {
  const needle = normalizeCanonical(target);
  if (!needle) return null;

  const text = Array.from(doc.text); // tableau de code points Unicode réels
  const needleR = Array.from(needle);
  const wanted = Math.max(0, quoteOrdinal);

  let first = -1;
  let seen = 0;
  for (let i = 0; i + needleR.length <= text.length; i++) {
    let match = true;
    for (let j = 0; j < needleR.length; j++) {
      if (text[i + j] !== needleR[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (first < 0) first = i;
    if (seen === wanted) {
      return { start: i, end: i + needleR.length };
    }
    seen++;
    i += needleR.length - 1; // occurrences non chevauchantes
  }

  if (first >= 0) {
    return { start: first, end: first + needleR.length };
  }
  return null;
}
