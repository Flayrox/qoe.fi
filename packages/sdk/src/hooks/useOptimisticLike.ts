'use client';

// =====================================================================
// ❤️ useOptimisticLike — Mutation optimiste « J'aime »
// =====================================================================
// Met à jour le cache React Query AVANT la réponse serveur (optimistic UI),
// avec snapshot + rollback en cas d'échec (règle architecturale n°4).
// - `onMutate` : annule les requêtes feed en vol, snapshot, puis met à jour
//   TOUTES les structures feed (infinite query `.pages` ou tableau plat).
// - `onError` : restaure les snapshots + notifie l'UI d'un 401 (modal login).
// - `onSettled` : invalide le feed pour resynchroniser avec le serveur.
// ⚠️ Le mobile utilise le shadow store (packages/sdk/src/shadow.ts)
//    plutôt que ce hook (le cache React Query y est partagé, mais les
//    mutations passent par l'API Go via QoeApiClient).
// =====================================================================

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys } from '../query-keys';
import { isUnauthorizedError, notifyUnauthorized } from '../utils/authError';
import { nextCount, patchFeedEntities, restoreFeeds, snapshotFeeds } from '../lib/optimisticFeed';

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
      const previousQueries = snapshotFeeds(queryClient);

      // Multi-cache predicate update across timeline, thread view, user posts
      patchFeedEntities(queryClient, thoughtId, (post) => {
        const delta = isLikedCurrent ? -1 : 1;
        const liked = !isLikedCurrent;
        return {
          ...post,
          liked,
          isLiked: liked,
          likeCount: nextCount(post, ['likeCount', 'likesCount'], delta),
          likesCount: nextCount(post, ['likesCount', 'likeCount'], delta),
        };
      });

      return { previousQueries };
    },

    onError: (
      err: Error,
      _variables: ToggleLikeVariables,
      context?: { previousQueries?: Array<[readonly unknown[], unknown]> }
    ) => {
      // Rollback all query snapshots on failure
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

export function useOptimisticLike(options?: UseOptimisticLikeOptions) {
  const queryClient = useQueryClient();
  return useMutation(createOptimisticLikeMutationOptions(queryClient, options));
}
