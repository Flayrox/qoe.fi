// =====================================================================
// 🔎 useSearch — Hooks React Query pour la recherche
// =====================================================================
// - useSearchQuery : recherche multi-entités (cache 30s), désactivée tant
//   que la requête est vide (`enabled`).
// - useTrendingQuery : hashtags tendance (cache 5 min).
// ⚠️ Côté mobile, la recherche passera par l'API Go
//    (apps/api-go/internal/modules/search → Meilisearch).
// =====================================================================

import { useQuery } from '@tanstack/react-query';
import { searchKeys } from '../query-keys';
import { searchAllAction, getTrendingHashtagsAction } from '../actions/search';

export function useSearchQuery(
  query: string,
  type: 'all' | 'thoughts' | 'users' | 'articles' = 'all'
) {
  return useQuery({
    queryKey: searchKeys.results(query, type),
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return { thoughts: [], users: [], articles: [], nextCursor: null };
      }
      const res = await searchAllAction({ query, type });
      if (!res.ok) {
        throw new Error(
          typeof res.error === 'string' ? res.error : res.error?.message || 'Erreur de recherche'
        );
      }
      return res.data;
    },
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30, // 30s cache
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
