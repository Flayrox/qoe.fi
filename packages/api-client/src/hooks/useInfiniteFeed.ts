import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { feedKeys } from '../query-keys';
import type { ApiResponse, ThoughtData } from '../types';

export type FeedType = 'for-you' | 'following' | 'highlights';

export interface FetchFeedParams {
  type: FeedType;
  cursor?: string | null;
  limit?: number;
  username?: string;
}

export type FeedFetcherFn<T = ThoughtData> = (params: FetchFeedParams) => Promise<ApiResponse<T[]>>;

export interface UseInfiniteFeedOptions<T = ThoughtData> {
  type?: FeedType;
  username?: string;
  limit?: number;
  fetcher: FeedFetcherFn<T>;
  enabled?: boolean;
  initialData?: {
    pages: ApiResponse<T[]>[];
    pageParams: (string | null)[];
  };
  filterFn?: (item: T) => boolean; // Fonction de filtrage local (ex: mots masqués, créateurs bloqués)
  minVisibleQuota?: number; // Nombre minimum de posts visibles garantis (Défaut: 30)
}

/**
 * ⏳ useInfiniteFeed — Feed infini paginé (générique).
 *
 * Générique sur le type d'item (`T`) : `ThoughtData` (web) ou `FeedSlice`
 * (mobile, API Go). La pagination suit le contrat `ApiResponse<T[]>.meta`
 * ({ cursor, hasMore }). Boucle d'auto-pagination tant que le quota de
 * confort (`minVisibleQuota`, défaut 30) n'est pas atteint.
 */
export function useInfiniteFeed<T = ThoughtData>({
  type = 'for-you',
  username,
  limit = 20,
  fetcher,
  enabled = true,
  initialData,
  filterFn,
  minVisibleQuota = 30,
}: UseInfiniteFeedOptions<T>) {
  const queryKey = username ? feedKeys.userPosts(username) : feedKeys.timeline(type);

  const queryResult = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      return fetcher({
        type,
        username,
        cursor: pageParam,
        limit,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage || !lastPage.meta) return undefined;
      return lastPage.meta.hasMore && lastPage.meta.cursor ? lastPage.meta.cursor : undefined;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    enabled,
    initialData: initialData as InfiniteData<ApiResponse<T[]>, string | null>,
  });

  const { data, hasNextPage, isFetching, fetchNextPage } = queryResult;

  // Calcul du nombre total d'éléments visibles après filtrage local
  const visibleCount = useMemo(() => {
    if (!data || !data.pages) return 0;
    const allItems = data.pages.flatMap((page) => page?.data || []);
    if (filterFn) {
      return allItems.filter(filterFn).length;
    }
    return allItems.length;
  }, [data, filterFn]);

  // Boucle d'Auto-Pagination : si le quota de confort n'est pas rempli et qu'il y a plus de pages, charger la suite
  useEffect(() => {
    if (enabled && hasNextPage && !isFetching && visibleCount < minVisibleQuota) {
      fetchNextPage();
    }
  }, [enabled, hasNextPage, isFetching, visibleCount, minVisibleQuota, fetchNextPage]);

  return queryResult;
}
