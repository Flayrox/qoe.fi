'use client';

import { useToggleMutationQueue } from '../lib/useToggleMutationQueue';
import { toggleRepostPostAction } from '../actions/feed';
import { updatePostShadow } from '../shadow';

/**
 * 🔁 File de toggle "Repost" — port de `usePostRepostMutationQueue` de Bluesky.
 */
export function usePostRepostMutationQueue(post: { id: string; reposted?: boolean }) {
  const postId = post.id;
  const initialReposted = !!post.reposted;

  const queueToggle = useToggleMutationQueue<boolean>({
    initialState: initialReposted,
    runMutation: async (prevReposted, shouldRepost) => {
      if (prevReposted === shouldRepost) return prevReposted;
      const res = await toggleRepostPostAction(postId);
      if (!res.ok) {
        const message = typeof res.error === 'string' ? res.error : res.error?.message;
        throw new Error(message || 'Erreur lors de la mise à jour du repartage');
      }
      return !!res.data?.reposted;
    },
    onSuccess: (finalReposted) => {
      updatePostShadow(postId, { reposted: finalReposted });
    },
  });

  const queueRepostToggle = () => {
    const nextReposted = !post.reposted;
    updatePostShadow(postId, { reposted: nextReposted });
    return queueToggle(nextReposted);
  };

  return [queueRepostToggle] as const;
}
