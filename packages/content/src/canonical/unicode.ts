// =====================================================================
// 🌐 canonical/unicode.ts — Conversions Code Points ↔ UTF-16
// =====================================================================
// Les offsets canoniques stockés en base et renvoyés par l'API Go sont
// des CODE POINTS Unicode (UTF-32 réels).
//
// En JavaScript, les chaînes de caractères sont indexées en unités UTF-16.
// Les caractères en dehors du plan multilingue de base (BMP > 0xFFFF, ex:
// emojis 🚀, 🧠, drapeaux 🇫🇷) occupent 2 unités UTF-16 (surrogate pair).
//
// Ces fonctions assurent la conversion rigoureuse aux frontières natives
// (iOS NSRange, Android Spannable) et garantissent la précision des ancres.
// =====================================================================

/**
 * Convertit un index de code point `cp` en index UTF-16 dans `text`.
 * Si `cp` <= 0, retourne 0.
 * Si `cp` dépasse le nombre total de code points, retourne `text.length`.
 */
export function cpToUtf16(text: string, cp: number): number {
  if (cp <= 0) return 0;
  let count = 0;
  for (let i = 0; i < text.length;) {
    if (count === cp) return i;
    count++;
    i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
  }
  return text.length;
}

/**
 * Nombre de code points Unicode réels dans `text`.
 */
export function cpLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length;) {
    count++;
    i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
  }
  return count;
}

/**
 * Convertit un index UTF-16 `u` en index de code point (0-based).
 * Si `u` tombe sur l'unité basse d'un surrogate pair, recule au début du code point.
 */
export function utf16ToCp(text: string, u: number): number {
  if (u <= 0) return 0;
  let count = 0;
  let i = 0;
  while (i < text.length && i < u) {
    const isSurrogate = (text.codePointAt(i) ?? 0) > 0xffff;
    const step = isSurrogate ? 2 : 1;
    // Si u pointe au milieu du surrogate (sur la low surrogate), on s'arrête ici
    if (i + step > u) {
      break;
    }
    i += step;
    count++;
  }
  return count;
}

/**
 * Découpe une sous-chaîne selon des bornes de code points `[startCp, endCp)`.
 */
export function cpSubstring(text: string, startCp: number, endCp?: number): string {
  const u16Start = cpToUtf16(text, startCp);
  const u16End = endCp !== undefined ? cpToUtf16(text, endCp) : text.length;
  return text.slice(u16Start, u16End);
}
