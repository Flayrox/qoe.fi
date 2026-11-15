'use client';

// =====================================================================
// 🔎 useSearch — Hooks React Query pour la recherche
// =====================================================================
// - useSearchQuery : recherche multi-entités (cache 30s), désactivée tant
//   que la requête est vide (`enabled`).
// - useTrendingQuery : hashtags tendance (cache 5 min).
// ⚠️ Côté mobile, la recherche passera par l'API Go
//    (apps/api/internal/modules/search → Meilisearch).
// =====================================================================

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { searchKeys } from '../query-keys';
import {
  searchAllAction,
  searchArticlesPageAction,
  searchThoughtsPageAction,
  searchSemanticAction,
  getTrendingHashtagsAction,
} from '../actions/search';

export function useSearchQuery(
  query: string,
  type: 'all' | 'thoughts' | 'users' | 'articles' = 'all',
  options: { enabled?: boolean; skipThoughts?: boolean; skipArticles?: boolean } = {}
) {
  const { enabled = true, skipThoughts = false, skipArticles = false } = options;
  return useQuery({
    queryKey: searchKeys.results(query, type, { skipThoughts, skipArticles }),
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return {
          thoughts: [],
          users: [],
          articles: [],
          nextCursor: null,
          articlesNextCursor: null,
        };
      }
      const res = await searchAllAction({ query, type, skipThoughts, skipArticles });
      if (!res.ok) {
        throw new Error(
          typeof res.error === 'string' ? res.error : res.error?.message || 'Erreur de recherche'
        );
      }
      return res.data;
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 1000 * 30, // 30s cache
  });
}

/**
 * Pages de pensées seules (curseur opaque). L'onglet Pensées ne rejoue pas
 * les articles ni les profils à chaque « Charger plus ».
 */
export function useInfiniteThoughtsQuery(query: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: searchKeys.thoughts(query),
    queryFn: async ({ pageParam }) => {
      const res = await searchThoughtsPageAction({
        query,
        cursor: pageParam,
        limit: 20,
      });
      if (!res.ok) {
        throw new Error(res.error?.message || 'Erreur de recherche');
      }
      return res.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && query.trim().length > 0,
    staleTime: 1000 * 30,
  });
}

/**
 * Pages d'articles seules (curseur opaque). Sert au « Charger plus » sans
 * rejouer les pensées et les profils de la recherche combinée.
 */
export function useInfiniteArticlesQuery(query: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: searchKeys.articles(query),
    queryFn: async ({ pageParam }) => {
      const res = await searchArticlesPageAction({
        query,
        cursor: pageParam,
        limit: 10,
      });
      if (!res.ok) {
        throw new Error(res.error?.message || 'Erreur de recherche');
      }
      return res.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: enabled && query.trim().length > 0,
    staleTime: 1000 * 30,
  });
}

/**
 * Recherche sémantique (pgvector). Pas de retry : un 503 signifie que le
 * service d'embedding n'est pas configuré, pas une panne transitoire.
 */
export function useSemanticSearchQuery(query: string, enabled = true) {
  return useQuery({
    queryKey: searchKeys.semantic(query),
    queryFn: async () => {
      const res = await searchSemanticAction({ query, limit: 10 });
      if (!res.ok) {
        throw new Error(res.error?.message || 'Recherche sémantique indisponible');
      }
      return res.data;
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 1000 * 60,
    retry: false,
  });
}

export function useTrendingQuery(limit = 10) {
  return useQuery({
    queryKey: searchKeys.trending(),
    queryFn: async () => {
      const res = await getTrendingHashtagsAction({ limit });
      if (!res.ok) {
        throw new Error(
          typeof res.error === 'string'
            ? res.error
            : res.error?.message || 'Erreur de chargement des tendances'
        );
      }
      return res.data.trends;
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });
}
