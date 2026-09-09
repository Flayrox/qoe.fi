import type { LibraryBookmark, LibraryHighlight } from './LibraryClient';

export type LibraryTab = 'bookmarks' | 'highlights' | 'annotations';

/**
 * Résout l'onglet actif à partir des query params d'URL (?tab=...).
 */
export function resolveLibraryTab(tab?: string | null): LibraryTab {
  if (tab === 'highlights') return 'highlights';
  if (tab === 'annotations') return 'annotations';
  return 'bookmarks';
}

/**
 * Nettoie le HTML brut d'un article pour en extraire un aperçu textuel élégant.
 */
export function cleanArticleExcerpt(rawContent: string, maxLength = 160): string {
  if (!rawContent) return '';
  const stripped = rawContent
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= maxLength) return stripped;
  return stripped.slice(0, maxLength).trim() + '…';
}

/**
 * Filtre les signets en temps réel selon une requête de recherche.
 */
export function filterBookmarks(bookmarks: LibraryBookmark[], query: string): LibraryBookmark[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return bookmarks;
  return bookmarks.filter((b) => {
    const titleMatch = b.article.title.toLowerCase().includes(normalized);
    const authorMatch = (b.article.author.name || '').toLowerCase().includes(normalized);
    const categoryMatch = (b.article.category?.name || '').toLowerCase().includes(normalized);
    return titleMatch || authorMatch || categoryMatch;
  });
}

/**
 * Filtre les surlignages en temps réel selon une requête de recherche.
 */
export function filterHighlights(
  highlights: LibraryHighlight[],
  query: string
): LibraryHighlight[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return highlights;
  return highlights.filter((h) => {
    const textMatch = h.text.toLowerCase().includes(normalized);
    const noteMatch = (h.note || '').toLowerCase().includes(normalized);
    const titleMatch = h.article.title.toLowerCase().includes(normalized);
    const pubMatch = (h.article.publication.name || '').toLowerCase().includes(normalized);
    return textMatch || noteMatch || titleMatch || pubMatch;
  });
}

/**
 * Filtre spécifiquement les annotations (surlignages avec note rédigée).
 */
export function filterAnnotations(
  highlights: LibraryHighlight[],
  query: string
): LibraryHighlight[] {
  const annotated = highlights.filter((h) => Boolean(h.note && h.note.trim().length > 0));
  return filterHighlights(annotated, query);
}

/**
 * Génère le fichier Markdown pour export (Notion, Obsidian, Bear).
 */
export function generateHighlightsMarkdown(
  highlights: LibraryHighlight[],
  exportDate: Date = new Date()
): string {
  if (highlights.length === 0) return '';

  const dateStr = exportDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let md = `# 📚 Bibliothèque de Surlignages — Qoe.fi\n\n`;
  md += `*Export généré le ${dateStr}*\n\n---\n\n`;

  const grouped = new Map<
    string,
    { title: string; publication: string; items: LibraryHighlight[] }
  >();

  highlights.forEach((h) => {
    if (!grouped.has(h.article.id)) {
      grouped.set(h.article.id, {
        title: h.article.title,
        publication: h.article.publication.name,
        items: [],
      });
    }
    grouped.get(h.article.id)!.items.push(h);
  });

  grouped.forEach((group) => {
    md += `## 📖 ${group.title}\n`;
    md += `*Source : ${group.publication}*\n\n`;
    group.items.forEach((item) => {
      md += `> « ${item.text} »\n`;
      if (item.note) {
        md += `>\n> ✍️ **Annotation :** *${item.note}*\n`;
      }
      md += `\n`;
    });
    md += `---\n\n`;
  });

  return md;
}
