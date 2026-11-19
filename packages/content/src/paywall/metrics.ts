// =====================================================================
// ⏱️ paywall/metrics.ts — Décompte de mots & temps de lecture multi-script
// =====================================================================

/**
 * Compte les mots d'un texte, avec support des scripts sans espaces (CJK).
 */
const CJK_CHAR = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g;

/** Caractères CJK (Chinois, Japonais, Coréen) d'un texte. */
function countCjkChars(text: string): number {
  return text.match(CJK_CHAR)?.length ?? 0;
}

/** Mots « alphabétiques » : tout ce qui n'est pas CJK. */
function countLatinWords(text: string): number {
  return text
    .replace(CJK_CHAR, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return countLatinWords(text) + countCjkChars(text);
}

export interface ReadingMetricsOptions {
  /** Mots par minute pour l'alphabet latin (défaut: 200 wpm). */
  wpm?: number;
  /** Caractères par minute pour les scripts CJK (défaut: 350 cpm). */
  cjkCpm?: number;
}

/**
 * Calcule le temps de lecture estimé en minutes.
 * Retourne un minimum de 1 minute si le texte contient au moins un mot.
 */
export function calculateReadingTimeMinutes(text: string, options?: ReadingMetricsOptions): number {
  if (!text || !text.trim()) return 0;

  // F153 — `cjkCpm` était documenté mais ignoré : chaque idéogramme était
  // compté comme un mot latin à 200 wpm, soit près du double du temps annoncé
  // par le produit pour un texte chinois ou japonais.
  const wpm = options?.wpm ?? 200;
  const cjkCpm = options?.cjkCpm ?? 350;
  const minutes = countLatinWords(text) / wpm + countCjkChars(text) / cjkCpm;
  if (minutes <= 0) return 0;
  return Math.max(1, Math.ceil(minutes));
}
