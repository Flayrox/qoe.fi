// =====================================================================
// 🔎 search-results.ts — helpers purs de la page Recherche
// =====================================================================
// Extraits du composant pour être testables sans DOM : fusion des pages
// d'articles (déduplication par id) et décision « y a-t-il un résultat
// pour cet onglet ? ».
// =====================================================================

import type { SearchArticleHit, SearchThoughtData } from '@qoe/sdk';

export type SearchTab = 'all' | 'thoughts' | 'users' | 'articles' | 'semantic';

export interface ArticleSearchPage {
  articles: SearchArticleHit[];
}

/**
 * Convertit une date de résultat en ISO **sans jamais jeter**.
 *
 * Meilisearch rend `createdAt` en secondes (nombre) ou en chaîne ; une valeur
 * illisible faisait jeter `new Date(value).toISOString()` (`RangeError: Invalid
 * time value`) dans le handler de clic, donc l'article ne s'ouvrait plus du
 * tout. On préfère omettre la date : l'ouverture reste possible.
 */
export function toIsoOrUndefined(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString();
}

/**
 * Fusionne les pages du `useInfiniteQuery` en une liste stable.
 *
 * Meilisearch peut renvoyer le même document sur deux pages si l'index
 * change entre deux requêtes : on déduplique par id (repli slug+publisher)
 * en conservant l'ordre de première apparition.
 */
export function mergeArticlePages(pages: ArticleSearchPage[] | undefined): SearchArticleHit[] {
  if (!pages?.length) return [];

  const seen = new Set<string>();
  const merged: SearchArticleHit[] = [];

  for (const page of pages) {
    for (const article of page?.articles ?? []) {
      const key = article.id || `${article.slug}:${article.publisherId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(article);
    }
  }

  return merged;
}

export interface ThoughtSearchPage {
  thoughts: SearchThoughtData[];
}

/** Même déduplication par id pour les pages de pensées. */
export function mergeThoughtPages(pages: ThoughtSearchPage[] | undefined): SearchThoughtData[] {
  if (!pages?.length) return [];

  const seen = new Set<string>();
  const merged: SearchThoughtData[] = [];

  for (const page of pages) {
    for (const thought of page?.thoughts ?? []) {
      if (!thought.id || seen.has(thought.id)) continue;
      seen.add(thought.id);
      merged.push(thought);
    }
  }

  return merged;
}

export interface SearchResultCounts {
  thoughts: number;
  users: number;
  articles: number;
  semantic: number;
}

/**
 * Un onglet peut être vide alors que les autres ne le sont pas : l'état
 * « aucun résultat » doit donc se décider par onglet, pas sur la somme.
 */
export function hasResultsForTab(tab: SearchTab, counts: SearchResultCounts): boolean {
  switch (tab) {
    case 'thoughts':
      return counts.thoughts > 0;
    case 'users':
      return counts.users > 0;
    case 'articles':
      return counts.articles > 0;
    case 'semantic':
      return counts.semantic > 0;
    case 'all':
    default:
      return counts.thoughts + counts.users + counts.articles > 0;
  }
}
