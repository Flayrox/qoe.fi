// =====================================================================
// 🔎 filter.ts — filtre de recherche d'une publication (serveur)
// =====================================================================
// Extrait du composant client pour que le filtrage ait lieu dans la page
// serveur : seuls les articles retenus sont sérialisés vers le navigateur.
// =====================================================================

import type { SearchArticleItem } from './TenantSearchClient';

/**
 * Filtre les articles d'une publication.
 *
 * - `query` : tous les mots doivent apparaître (titre, extrait ou rubrique),
 *   insensible à la casse — même contrat que l'ancien filtre client.
 * - `categorySlug` : `all` ou slug exact de la rubrique.
 */
export function filterTenantArticles(
  articles: SearchArticleItem[],
  query: string,
  categorySlug = 'all'
): SearchArticleItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return articles.filter((article) => {
    if (categorySlug !== 'all' && article.categorySlug !== categorySlug) {
      return false;
    }
    if (words.length === 0) return true;

    const title = (article.title || '').toLowerCase();
    const excerpt = (article.excerpt || '').toLowerCase();
    const category = (article.categoryName || '').toLowerCase();

    return words.every(
      (word) => title.includes(word) || excerpt.includes(word) || category.includes(word)
    );
  });
}
