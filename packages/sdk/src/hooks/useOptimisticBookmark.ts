'use client';

// =====================================================================
// 🔖 useOptimisticBookmark — Mutation optimiste « Signet »
// =====================================================================
// Patron identique aux hooks like/repost, appliqué au marque-page
// (bookmark) d'articles. Bascule `isBookmarked`/`bookmarked` dans le cache
// feed avec snapshot + rollback + invalidation.
// =====================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';
import { patchFeedEntities, restoreFeeds, snapshotFeeds } from '../lib/optimisticFeed';

export interface ToggleBookmarkVariables {
  articleId: string;
  isBookmarkedCurrent: boolean;
  bookmarkMutationFn: (
    articleId: string,
    isBookmarkedCurrent: boolean
  ) => Promise<{ success: boolean; message?: string }>;
}

export interface UseOptimisticBookmarkOptions {
  onError?: (error: Error) => void;
}

export function createOptimisticBookmarkMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: UseOptimisticBookmarkOptions
) {
  return {
    mutationFn: async ({
      articleId,
      isBookmarkedCurrent,
      bookmarkMutationFn,
    }: ToggleBookmarkVariables) => {
      const response = await bookmarkMutationFn(articleId, isBookmarkedCurrent);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update bookmark');
      }
      return response;
    },

    onMutate: async ({ articleId, isBookmarkedCurrent }: ToggleBookmarkVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previousQueries = snapshotFeeds(queryClient);

      patchFeedEntities(queryClient, articleId, (article) => {
        const bookmarked = !isBookmarkedCurrent;
        return { ...article, isBookmarked: bookmarked, bookmarked };
      });

      return { previousQueries };
    },

    onError: (
      err: Error,
      _variables: ToggleBookmarkVariables,
      context?: { previousQueries?: Array<[readonly unknown[], unknown]> }
    ) => {
      restoreFeeds(queryClient, context?.previousQueries);
      if (isUnauthorizedError(err)) {
        notifyUnauthorized(err);
      }
      options?.onError?.(err);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all });
    },
  };
}

export function useOptimisticBookmark(options?: UseOptimisticBookmarkOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticBookmarkMutationOptions(queryClient, options));
}
