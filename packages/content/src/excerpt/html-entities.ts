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
 * Décode un point de code numérique, ou null s'il est inexploitable.
 *
 * F152 — `&#0;` produisait un NUL (chaîne tronquée côté JSON/Postgres) et
 * `&#xD800;` un demi-surrogate, donc une chaîne UTF-16 illégale. Ces deux
 * formes ne sont pas des caractères : on laisse l'entité telle quelle, comme
 * pour les entités inconnues (l'appelant nettoie ce qui reste).
 */
function decodeCodePoint(code: number): string | null {
  if (!Number.isFinite(code)) return null;
  if (code <= 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  return String.fromCodePoint(code);
}

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
      return decodeCodePoint(parseInt(entity.slice(2), 16)) ?? match;
    }
    // Numérique décimal &#128640;
    if (entity.startsWith('#')) {
      return decodeCodePoint(parseInt(entity.slice(1), 10)) ?? match;
    }
    return match;
  });
}
