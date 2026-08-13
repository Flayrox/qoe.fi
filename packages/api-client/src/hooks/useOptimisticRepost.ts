import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';

export interface ToggleRepostVariables {
  thoughtId: string;
  isRepostedCurrent: boolean;
  repostMutationFn: (
    thoughtId: string,
    isRepostedCurrent: boolean
  ) => Promise<{ success: boolean; message?: string }>;
}

export interface UseOptimisticRepostOptions {
  onError?: (error: Error) => void;
}

export function createOptimisticRepostMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: UseOptimisticRepostOptions
) {
  return {
    mutationFn: async ({
      thoughtId,
      isRepostedCurrent,
      repostMutationFn,
    }: ToggleRepostVariables) => {
      const response = await repostMutationFn(thoughtId, isRepostedCurrent);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update repost');
      }
      return response;
    },

    onMutate: async ({ thoughtId, isRepostedCurrent }: ToggleRepostVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      const previousQueries = queryClient.getQueriesData({ queryKey: feedKeys.all });

      queryClient.setQueriesData({ queryKey: feedKeys.all }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const dataObj = oldData as Record<string, unknown>;

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
                    const currentCount = typeof p.repostCount === 'number' ? p.repostCount : 0;
                    return {
                      ...p,
                      reposted: !isRepostedCurrent,
                      isReposted: !isRepostedCurrent,
                      repostCount: isRepostedCurrent
                        ? Math.max(0, currentCount - 1)
                        : currentCount + 1,
                    };
                  }
                  return post;
                }),
              };
            }),
          };
        }

        if (Array.isArray(oldData)) {
          return oldData.map((post: unknown) => {
            if (!post || typeof post !== 'object') return post;
            const p = post as Record<string, unknown>;
            if (p.id === thoughtId) {
              const currentCount = typeof p.repostCount === 'number' ? p.repostCount : 0;
              return {
                ...p,
                reposted: !isRepostedCurrent,
                isReposted: !isRepostedCurrent,
                repostCount: isRepostedCurrent ? Math.max(0, currentCount - 1) : currentCount + 1,
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
      _variables: ToggleRepostVariables,
      context?: { previousQueries?: Array<[readonly unknown[], unknown]> }
    ) => {
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

export function useOptimisticRepost(options?: UseOptimisticRepostOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticRepostMutationOptions(queryClient, options));
}
