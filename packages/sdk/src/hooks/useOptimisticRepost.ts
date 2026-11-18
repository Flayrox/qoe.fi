'use client';

// =====================================================================
// 🔁 useOptimisticRepost — Mutation optimiste « Repartager »
// =====================================================================
// Même patron que useOptimisticLike : update optimiste du cache feed,
// snapshot + rollback sur erreur, invalidation à la fin. Gère l'offset du
// compteur `repostCount` (dérivé de l'état courant, jamais désynchronisé).
// ⚠️ Côté mobile, le repost passe par QoeApiClient.toggleRepost + shadow.
// =====================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';
import { nextCount, patchFeedEntities, restoreFeeds, snapshotFeeds } from '../lib/optimisticFeed';

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
      const previousQueries = snapshotFeeds(queryClient);

      patchFeedEntities(queryClient, thoughtId, (post) => {
        const delta = isRepostedCurrent ? -1 : 1;
        const reposted = !isRepostedCurrent;
        return {
          ...post,
          reposted,
          isReposted: reposted,
          repostCount: nextCount(post, ['repostCount', 'repostsCount'], delta),
          repostsCount: nextCount(post, ['repostsCount', 'repostCount'], delta),
        };
      });

      return { previousQueries };
    },

    onError: (
      err: Error,
      _variables: ToggleRepostVariables,
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

export function useOptimisticRepost(options?: UseOptimisticRepostOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticRepostMutationOptions(queryClient, options));
}
