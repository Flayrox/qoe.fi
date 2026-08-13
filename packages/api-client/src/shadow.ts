'use client';

import { useEffect, useState, useMemo } from 'react';

/**
 * 📦 Post Shadow Store — port de l'architecture Bluesky `state/cache/post-shadow.ts`.
 *
 * Chaque pensée possède un « shadow » (état optimiste) et un ensemble d'écouteurs
 * dédié (EventEmitter par post), ce qui évite de re-rendre tous les abonnés à la
 * moindre mise à jour d'un autre post.
 *
 * Comme Bluesky, le shadow ne stocke que des booléens (`liked`, `reposted`,
 * `isDeleted`) : les compteurs sont *dérivés* à la lecture à partir du delta
 * entre l'état serveur (`post.liked`) et le shadow. C'est idempotent et il n'y a
 * plus de compteurs désynchronisés.
 */

export const POST_TOMBSTONE = Symbol('PostTombstone');

export interface PostShadow {
  liked?: boolean;
  reposted?: boolean;
  isDeleted?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  [key: string]: unknown;
}

const shadows = new Map<string, PostShadow>();
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

function notify(key: string) {
  const set = listeners.get(key);
  if (set) set.forEach((fn) => fn());
}

/**
 * 🔄 Met à jour ou fusionne l'état réactif d'une pensée puis notifie uniquement
 * les abonnés de cette pensée (EventEmitter par post, comme Bluesky).
 */
export function updatePostShadow(postId: string, patch: Partial<PostShadow>) {
  shadows.set(postId, { ...shadows.get(postId), ...patch });
  notify(postId);
}

/**
 * 🔍 Lecture directe de l'état ombré d'une pensée.
 * À utiliser avec précaution — préférer `usePostShadow`.
 */
export function getPostShadow(postId: string): PostShadow | undefined {
  return shadows.get(postId);
}

/**
 * ⚛️ Abonne le composant à l'état ombré d'une pensée et renvoie la pensée fusionnée.
 * Le shadow est stocké dans un état local (comme Bluesky) et mis à jour par
 * l'écouteur per-post, ce qui fait recalculer le `useMemo` à chaque mise à jour.
 */
export function usePostShadow<T extends { id?: string }>(post: T): T {
  const postId = post?.id;
  const [shadow, setShadow] = useState<PostShadow | undefined>(() =>
    postId ? shadows.get(postId) : undefined
  );

  useEffect(() => {
    if (!postId) return;
    setShadow(shadows.get(postId));
    return subscribe(postId, () => setShadow(shadows.get(postId)));
  }, [postId]);

  return useMemo(() => {
    if (!post || !postId || !shadow) return post;
    return mergeShadow(post, shadow);
  }, [post, postId, shadow]);
}

type LikeablePost = {
  id?: string;
  liked?: boolean;
  likesCount?: number;
  likeCount?: number;
  reposted?: boolean;
  repostsCount?: number;
  repostCount?: number;
  isDeleted?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
};

function mergeShadow<T extends LikeablePost>(post: T, shadow: PostShadow): T {
  const result: LikeablePost = { ...post };

  const baseLikeCount = post.likesCount ?? post.likeCount ?? post._count?.likes ?? 0;
  if (typeof shadow.liked === 'boolean') {
    const wasLiked = !!post.liked;
    const isLiked = shadow.liked;
    if (wasLiked !== isLiked) {
      result.likeCount = isLiked ? baseLikeCount + 1 : Math.max(0, baseLikeCount - 1);
      result.likesCount = result.likeCount;
    }
    result.liked = isLiked;
  }

  const baseRepostCount = post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0;
  if (typeof shadow.reposted === 'boolean') {
    const wasReposted = !!post.reposted;
    const isReposted = shadow.reposted;
    if (wasReposted !== isReposted) {
      result.repostCount = isReposted ? baseRepostCount + 1 : Math.max(0, baseRepostCount - 1);
      result.repostsCount = result.repostCount;
    }
    result.reposted = isReposted;
  }

  if (typeof shadow.isDeleted === 'boolean') {
    result.isDeleted = shadow.isDeleted;
  }

  if (typeof shadow.pinned === 'boolean') {
    (result as T & { isPinned: boolean }).isPinned = shadow.pinned;
  }

  return result as T;
}
