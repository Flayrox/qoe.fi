'use client';

import { useToggleMutationQueue } from '../lib/useToggleMutationQueue';
import { toggleLikePostAction } from '../actions/feed';
import { updatePostShadow } from '../shadow';

/**
 * ❤️ File de toggle "J'aime" — port de `usePostLikeMutationQueue` de Bluesky.
 *
 * Optimiste : pose le shadow, sérialise via la file, puis réconcilie l'état
 * confirmé par le serveur. Aucun setQueriesData, aucune invalidation manuelle.
 */
export function usePostLikeMutationQueue(post: { id: string; liked?: boolean }) {
  const postId = post.id;
  const initialLiked = !!post.liked;

  const queueToggle = useToggleMutationQueue<boolean>({
    initialState: initialLiked,
    runMutation: async (prevLiked, shouldLike) => {
      if (prevLiked === shouldLike) return prevLiked;
      const res = await toggleLikePostAction(postId);
      if (!res.ok) {
        const message = typeof res.error === 'string' ? res.error : res.error?.message;
        throw new Error(message || "Erreur lors de la mise à jour du J'aime");
      }
      return !!res.data?.liked;
    },
    onSuccess: (finalLiked) => {
      updatePostShadow(postId, { liked: finalLiked });
    },
  });

  const queueLikeToggle = () => {
    const nextLiked = !post.liked;
    updatePostShadow(postId, { liked: nextLiked });
    return queueToggle(nextLiked);
  };

  return [queueLikeToggle] as const;
}
