import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys, userKeys } from '../query-keys';

export interface ToggleFollowVariables {
  creatorId: string;
  isFollowedCurrent: boolean;
  followMutationFn: (creatorId: string, isFollowedCurrent: boolean) => Promise<{ success: boolean; message?: string }>;
}

export interface UseOptimisticFollowOptions {
  onError?: (error: Error) => void;
}

export function createOptimisticFollowMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: UseOptimisticFollowOptions
) {
  return {
    mutationFn: async ({ creatorId, isFollowedCurrent, followMutationFn }: ToggleFollowVariables) => {
      const response = await followMutationFn(creatorId, isFollowedCurrent);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update follow status');
      }
      return response;
    },

    onMutate: async ({ creatorId, isFollowedCurrent }: ToggleFollowVariables) => {
      await queryClient.cancelQueries({ queryKey: feedKeys.all });
      await queryClient.cancelQueries({ queryKey: userKeys.all });

      const previousFeedQueries = queryClient.getQueriesData({ queryKey: feedKeys.all });
      const previousUserQueries = queryClient.getQueriesData({ queryKey: userKeys.all });

      // Update follow flags on creator profiles in cache
      queryClient.setQueriesData({ queryKey: userKeys.all }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const u = oldData as Record<string, unknown>;
        if (u.id === creatorId) {
          return {
            ...u,
            isFollowed: !isFollowedCurrent,
            isFollowing: !isFollowedCurrent,
          };
        }
        return oldData;
      });

      return { previousFeedQueries, previousUserQueries };
    },

    onError: (err: Error, _variables: ToggleFollowVariables, context?: { previousFeedQueries?: Array<[readonly unknown[], unknown]>; previousUserQueries?: Array<[readonly unknown[], unknown]> }) => {
      if (context?.previousFeedQueries) {
        context.previousFeedQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.previousUserQueries) {
        context.previousUserQueries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      options?.onError?.(err);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all });
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  };
}

export function useOptimisticFollow(options?: UseOptimisticFollowOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticFollowMutationOptions(queryClient, options));
}
