// =====================================================================
// 🎯 quote-anchor.ts — Ancrage d'une citation dans un contenu HTML.
// =====================================================================
// Les surlignages qoe.fi n'ont pas d'offsets stockés : leur ancre est le
// TEXTE CITÉ. Quand le même passage apparaît plusieurs fois,
// `quoteOrdinal` désigne quelle occurrence surligner (0-based), avec
// repli gracieux sur la première occurrence trouvée si le contenu a été
// édité entre-temps.
//
// Utilisé par le moteur d'annotations de qoe.fi ET exposé aux fronts
// personnalisés (via @qoe/ui/annotations) pour un rendu identique.
// =====================================================================

export interface QuoteMatch {
  /** Nœud texte contenant l'occurrence visée. */
  textNode: Text;
  /** Index de départ de l'occurrence dans ce nœud. */
  index: number;
}

/**
 * 🔎 Localise l'occurrence n° `quoteOrdinal` de `quotedText` dans `root`.
 * Compte les occurrences à travers TOUS les nœuds texte (un passage peut
 * être coupé entre plusieurs éléments HTML). Repli sur la première
 * occurrence si l'ordinal demandé dépasse le nombre trouvé.
 */
export function findQuoteOccurrence(
  root: HTMLElement,
  quotedText: string,
  quoteOrdinal = 0
): QuoteMatch | null {
  const target = quotedText.trim();
  if (!target) return null;

  root.normalize(); // Fusionne les nœuds texte adjacents (fiabilité indexOf).

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  const wanted = Math.max(0, Math.floor(quoteOrdinal));
  let firstMatch: QuoteMatch | null = null;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const content = textNode.textContent || '';

    let from = 0;
    for (;;) {
      const index = content.indexOf(target, from);
      if (index === -1) break;

      if (!firstMatch) {
        firstMatch = { textNode, index };
      }
      if (seen === wanted) {
        return { textNode, index };
      }
      seen++;
      from = index + target.length;
    }
  }

  // Repli : l'ordinal demandé n'existe plus (contenu édité).
  return firstMatch;
}
