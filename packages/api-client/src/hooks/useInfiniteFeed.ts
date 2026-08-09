import { useInfiniteQuery, type UseInfiniteQueryOptions } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import type { ApiResponse, ThoughtData } from '../types';

export type FeedType = 'for-you' | 'following' | 'highlights';

export interface FetchFeedParams {
  type: FeedType;
  cursor?: string | null;
  limit?: number;
  username?: string;
}

export type FeedFetcherFn = (params: FetchFeedParams) => Promise<ApiResponse<ThoughtData[]>>;

export interface UseInfiniteFeedOptions {
  type?: FeedType;
  username?: string;
  limit?: number;
  fetcher: FeedFetcherFn;
  enabled?: boolean;
  initialData?: {
    pages: ApiResponse<ThoughtData[]>[];
    pageParams: (string | null)[];
  };
}

export function useInfiniteFeed({
  type = 'for-you',
  username,
  limit = 20,
  fetcher,
  enabled = true,
  initialData,
}: UseInfiniteFeedOptions) {
  const queryKey = username ? feedKeys.userPosts(username) : feedKeys.timeline(type);

  return useInfiniteQuery({
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
    initialData: initialData as any,
  });
}
