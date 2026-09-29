// =====================================================================
// 🔎 Recherche dans un EPUB — logique pure (testable en node)
// =====================================================================
// Les chapitres sont DÉJÀ dans le client (le détail les renvoie d'un bloc) :
// chercher localement est instantané et évite un aller-retour par frappe.
// Recherche insensible à la casse ET aux accents (un lecteur qui tape
// « resume » doit trouver « résumé »), extraits centrés sur la première
// occurrence, bornés par chapitre et au total.
// =====================================================================

export interface EbookChapterLike {
  title: string;
  html: string;
}

export interface EbookSearchHit {
  chapterIndex: number;
  chapterTitle: string;
  snippet: string;
  /** Position de l'occurrence DANS le snippet (pour la surligner). */
  matchStart: number;
  matchLength: number;
}

export interface EbookSearchOptions {
  /** Nombre total d'extraits renvoyés. */
  limit?: number;
  /** Nombre d'extraits maximum par chapitre. */
  perChapter?: number;
  /** Longueur de contexte de part et d'autre du match. */
  context?: number;
}

const DEFAULT_LIMIT = 40;
const DEFAULT_PER_CHAPTER = 3;
const DEFAULT_CONTEXT = 60;
const MIN_QUERY = 2;

/** Retire les accents et la casse (recherche « résume » → « resume »). */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** HTML strict → texte lisible (les balises deviennent des séparateurs). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait centré sur un match, élargi aux mots entiers quand c'est possible
 * (jamais de mot coupé au milieu dans l'affichage).
 */
function snippetAround(
  text: string,
  index: number,
  matchLength: number,
  context: number
): { snippet: string; matchStart: number } {
  let start = Math.max(0, index - context);
  let end = Math.min(text.length, index + matchLength + context);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space !== -1 && space > index + matchLength) end = space;
  }
  return { snippet: text.slice(start, end).trim(), matchStart: index - start };
}

/**
 * Cherche `query` dans les chapitres. Résultat vide si la requête est trop
 * courte (< 2 caractères) : pas de bruit sur une seule lettre.
 */
export function searchEbookChapters(
  chapters: EbookChapterLike[],
  query: string,
  options: EbookSearchOptions = {}
): EbookSearchHit[] {
  const needle = normalizeForSearch(query.trim());
  if (needle.length < MIN_QUERY) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const perChapter = options.perChapter ?? DEFAULT_PER_CHAPTER;
  const context = options.context ?? DEFAULT_CONTEXT;

  const hits: EbookSearchHit[] = [];
  for (let ci = 0; ci < chapters.length && hits.length < limit; ci++) {
    const chapter = chapters[ci];
    const text = htmlToPlainText(chapter.html ?? '');
    if (!text) continue;
    const haystack = normalizeForSearch(text);

    let from = 0;
    let found = 0;
    while (found < perChapter && hits.length < limit) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      const { snippet, matchStart } = snippetAround(text, index, needle.length, context);
      hits.push({
        chapterIndex: ci,
        chapterTitle: chapter.title || `Chapitre ${ci + 1}`,
        snippet,
        matchStart,
        matchLength: needle.length,
      });
      from = index + needle.length;
      found++;
    }
  }
  return hits;
}
