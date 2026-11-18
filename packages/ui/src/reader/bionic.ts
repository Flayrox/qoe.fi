/**
 * Bionic Reading Transformer
 * Guides the eye through text by emphasizing the first 30-50% of each word.
 * Helps with ADHD, neurodiversity, cognitive fatigue, and reading velocity.
 */

export function getBionicSplitIndex(wordLength: number): number {
  if (wordLength <= 1) return 1;
  if (wordLength <= 3) return 1;
  if (wordLength <= 6) return 2;
  if (wordLength <= 9) return 3;
  return Math.ceil(wordLength * 0.4);
}

/**
 * Une entité HTML (`&nbsp;`, `&amp;`, `&#8230;`) n'est PAS un mot.
 *
 * ⚠️ Traitée comme un mot, elle était coupée en `<b>&n</b>bsp;` : le
 * navigateur n'interprétait plus l'entité et affichait « a&n bsp;b » à la
 * place d'un espace insécable. Sur un texte accentué et typographié, ce
 * n'était pas un détail : guillemets français et espaces insécables sont
 * précisément les entités qu'on rencontre dans nos articles.
 */
const HTML_ENTITY_SOURCE = '&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\\d{1,7}|#x[0-9a-fA-F]{1,6});';
const HTML_ENTITY = new RegExp(HTML_ENTITY_SOURCE);
const HTML_ENTITY_SPLIT = new RegExp(`(${HTML_ENTITY_SOURCE})`);

/**
 * Transforms a single plain word into Bionic Reading HTML
 */
export function formatBionicWord(token: string): string {
  if (!token) return '';

  // Les entités restent intactes ; seuls les fragments de texte qui les
  // entourent sont mis en gras.
  if (HTML_ENTITY.test(token)) {
    return token
      .split(HTML_ENTITY_SPLIT)
      .map((part) =>
        part.startsWith('&') && part.endsWith(';') && HTML_ENTITY.test(part)
          ? part
          : formatBionicWord(part)
      )
      .join('');
  }

  // Extract leading punctuation (e.g. quotes, parentheses, brackets)
  const leadingMatch = token.match(/^[^a-zA-Z0-9À-ÿ]+/);
  const leading = leadingMatch ? leadingMatch[0] : '';
  const restAfterLeading = token.slice(leading.length);

  if (!restAfterLeading) return token;

  // Extract trailing punctuation (e.g. commas, dots, question marks)
  const trailingMatch = restAfterLeading.match(/[^a-zA-Z0-9À-ÿ]+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const coreWord = restAfterLeading.slice(0, restAfterLeading.length - trailing.length);

  if (!coreWord) return token;

  // Handle French apostrophes: "l'article", "d'un", "qu'elle"
  const apostropheIndex = coreWord.indexOf("'");
  if (apostropheIndex > 0 && apostropheIndex <= 2) {
    const prefix = coreWord.slice(0, apostropheIndex + 1);
    const mainWord = coreWord.slice(apostropheIndex + 1);
    if (mainWord.length > 0) {
      const splitIdx = getBionicSplitIndex(mainWord.length);
      const boldPart = mainWord.slice(0, splitIdx);
      const normalPart = mainWord.slice(splitIdx);
      return `${leading}<b>${prefix}${boldPart}</b>${normalPart}${trailing}`;
    }
  }

  const split = getBionicSplitIndex(coreWord.length);
  const boldPart = coreWord.slice(0, split);
  const normalPart = coreWord.slice(split);

  return `${leading}<b>${boldPart}</b>${normalPart}${trailing}`;
}

/**
 * Transforms a plain text string into Bionic Reading HTML
 */
export function formatBionicText(text: string): string {
  if (!text) return '';
  // Split on whitespace while preserving spacing
  return text
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk;
      return formatBionicWord(chunk);
    })
    .join('');
}

/**
 * Transforms HTML content into Bionic Reading by processing only text nodes
 * and strictly leaving HTML tags, attributes, and entities untouched.
 */
export function formatBionicHtml(html: string): string {
  if (!html) return '';

  // Match either HTML tag or text between tags
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_match, tag, text) => {
    if (tag) return tag;
    if (text) {
      return formatBionicText(text);
    }
    return '';
  });
}
