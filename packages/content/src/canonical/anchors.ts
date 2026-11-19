// =====================================================================
// ⚓ anchors.ts — Calcul d'ancrage canonique des surlignages (Miroir Go)
// =====================================================================

import type { CanonicalDocument } from './types';

/** Génère un identifiant local unique (préfixe `local-` pour ne pas collisionner). */
export function makeLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Blancs reconnus par `unicode.IsSpace` (Go) — et **eux seuls**.
 *
 * F150 — `\s` de JavaScript n'est pas le même ensemble : il ignore U+0085
 * (NEL) et inclut U+FEFF (BOM). Un passage collé depuis un fichier (BOM) ou un
 * terminal (NEL) n'était donc pas normalisé comme côté serveur, et les ancres
 * calculées localement tombaient à côté de celles que Go recalcule.
 */
const GO_SPACE = /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/;

/**
 * Normalise un texte comme le serveur (`canon.Normalize`) :
 * les séquences de blancs Unicode deviennent un espace unique, bordures trimées.
 * Le BOM n'est pas un blanc pour Go : il est conservé.
 */
export function normalizeCanonical(s: string): string {
  let out = '';
  let prevSpace = true; // → trim des blancs de tête
  for (const ch of s) {
    if (GO_SPACE.test(ch)) {
      if (prevSpace) continue;
      prevSpace = true;
      out += ' ';
    } else {
      prevSpace = false;
      out += ch;
    }
  }
  // Seul le séparateur ASCII est produit ci-dessus : pas de `trim()`, qui
  // retirerait aussi un BOM de bord et divergerait de `strings.TrimSpace`.
  return out.endsWith(' ') ? out.slice(0, -1) : out;
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
