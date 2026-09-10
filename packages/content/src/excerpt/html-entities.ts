// =====================================================================
// 🔤 excerpt/html-entities.ts — Décodeur d'entités HTML sans DOM
// =====================================================================

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&laquo;': '«',
  '&raquo;': '»',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
};

/**
 * Décode les entités HTML nommées et numériques sans nécessiter de DOM.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input) return '';

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (NAMED_ENTITIES[match]) {
      return NAMED_ENTITIES[match];
    }
    // Numérique hexadécimal &#x1F680;
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = parseInt(entity.slice(2), 16);
      return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    // Numérique décimal &#128640;
    if (entity.startsWith('#')) {
      const code = parseInt(entity.slice(1), 10);
      return !isNaN(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}
