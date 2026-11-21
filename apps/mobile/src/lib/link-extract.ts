// =====================================================================
// 🔗 link-extract.ts — Extraction d'URL d'un texte de pensée (PUR)
// =====================================================================
// Aucune dépendance React Native : testable en `node` (vitest), comme
// highlight-queue-core / html-blocks-core.
//
// Le texte d'une pensée est de la prose : l'URL y est collée à de la
// ponctuation (« … : https://qoe.fi/a. »). Cette ponctuation de phrase ne
// fait pas partie du lien — sans ce nettoyage la carte de lien affiche un
// hôte « qoe.fi. » et le navigateur ouvre une URL inexistante.
// =====================================================================

/** Ponctuation de phrase susceptible de suivre une URL dans de la prose. */
const TRAILING_PUNCTUATION = new Set([
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  '…',
  '»',
  '”',
  '’',
  "'",
  ')',
  ']',
]);

/**
 * Retire la ponctuation finale collée à l'URL. Une parenthèse/crochet fermant
 * est conservé quand il appartient à l'URL (parenthèse ouvrante appariée,
 * cas des liens Wikipédia `…/X_(film)`).
 */
function trimTrailingPunctuation(url: string): string {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    if (!TRAILING_PUNCTUATION.has(last)) break;
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      if (opens >= closes) break; // paire complète → la parenthèse est dans l'URL
    }
    out = out.slice(0, -1);
  }
  return out;
}

/** Première URL http(s) du texte, ponctuation de phrase retirée, ou null. */
export function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  const url = trimTrailingPunctuation(match[0]);
  // « https:// » seul (ponctuation mangée) n'est pas un lien.
  return /^https?:\/\/[^/]+/i.test(url) ? url : null;
}

/** Hôte affiché d'une URL (sans `www.`), ou l'URL brute si invalide. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
