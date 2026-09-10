// =====================================================================
// ⏱️ paywall/metrics.ts — Décompte de mots & temps de lecture multi-script
// =====================================================================

/**
 * Compte les mots d'un texte, avec support des scripts sans espaces (CJK).
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;

  // 1. Détection et décompte des caractères CJK (Chinois, Japonais, Coréen)
  const cjkMatches = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // 2. Nettoyage des CJK et décompte des mots alphabétiques / latins
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latinWords = nonCjkText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  return latinWords.length + cjkCount;
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
  const words = countWords(text);
  if (words === 0) return 0;

  const wpm = options?.wpm ?? 200;
  const minutes = Math.ceil(words / wpm);
  return Math.max(1, minutes);
}
