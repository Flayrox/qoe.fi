import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';

export interface ToggleLikeVariables {
  thoughtId: string;
  isLikedCurrent: boolean;
  likeMutationFn: (
    thoughtId: string,
    isLikedCurrent: boolean
  ) => Promise<{ success: boolean; message?: string }>;
}

export interface UseOptimisticLikeOptions {
  onError?: (error: Error) => void;
}

export function createOptimisticLikeMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: UseOptimisticLikeOptions
) {
  return {
    mutationFn: async ({ thoughtId, isLikedCurrent, likeMutationFn }: ToggleLikeVariables) => {
      const response = await likeMutationFn(thoughtId, isLikedCurrent);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update reaction');
      }
      return response;
    },

    onMutate: async ({ thoughtId, isLikedCurrent }: ToggleLikeVariables) => {
      // Cancel all feed queries to prevent race conditions during optimistic update
      await queryClient.cancelQueries({ queryKey: feedKeys.all });

      // Snapshot all existing query data for rollback
      const previousQueries = queryClient.getQueriesData({ queryKey: feedKeys.all });

      // Multi-cache predicate update across timeline, thread view, user posts
      queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;

        const dataObj = oldData as Record<string, unknown>;

        // Handle Infinite Queries data structure (.pages array)
        if (Array.isArray(dataObj.pages)) {
          return {
            ...dataObj,
            pages: dataObj.pages.map((page: unknown) => {
              if (!page || typeof page !== 'object') return page;
              const pageObj = page as Record<string, unknown>;
              if (!Array.isArray(pageObj.data)) return page;

              return {
                ...pageObj,
                data: pageObj.data.map((post: unknown) => {
                  if (!post || typeof post !== 'object') return post;
                  const p = post as Record<string, unknown>;
                  if (p.id === thoughtId) {
                    const currentCount = typeof p.likeCount === 'number' ? p.likeCount : 0;
                    return {
                      ...p,
                      liked: !isLikedCurrent,
                      isLiked: !isLikedCurrent,
                      likeCount: isLikedCurrent ? Math.max(0, currentCount - 1) : currentCount + 1,
                    };
                  }
                  return post;
                }),
              };
            }),
          };
        }

        // Handle Flat Array structure
        if (Array.isArray(oldData)) {
          return oldData.map((post: unknown) => {
            if (!post || typeof post !== 'object') return post;
            const p = post as Record<string, unknown>;
            if (p.id === thoughtId) {
              const currentCount = typeof p.likeCount === 'number' ? p.likeCount : 0;
              return {
                ...p,
                liked: !isLikedCurrent,
                isLiked: !isLikedCurrent,
                likeCount: isLikedCurrent ? Math.max(0, currentCount - 1) : currentCount + 1,
              };
            }
            return post;
          });
        }

        return oldData;
      });

      return { previousQueries };
    },

    onError: (
      err: Error,
      _variables: ToggleLikeVariables,
      context?: { previousQueries?: Array<[readonly unknown[], unknown]> }
    ) => {
      // Rollback all query snapshots on failure
      if (context?.previousQueries) {
        context.previousQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
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

export function useOptimisticLike(options?: UseOptimisticLikeOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticLikeMutationOptions(queryClient, options));
}
