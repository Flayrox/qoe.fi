'use client';

// =====================================================================
// ⚡ usePostShadow — Shadow State Store réactif pour Posts / Thoughts
// Inspiré du post-shadow de Bluesky pour la synchronisation transverse
// =====================================================================

import { useState, useEffect } from 'react';

export interface PostShadowState {
  liked?: boolean;
  likesCount?: number;
  reposted?: boolean;
  repostsCount?: number;
  isHiddenByAuthor?: boolean;
}

type Listener = () => void;

const shadowMap = new Map<string, PostShadowState>();
const listenersMap = new Map<string, Set<Listener>>();

function notify(postId: string) {
  const set = listenersMap.get(postId);
  if (set) {
    set.forEach((listener) => listener());
  }
}

/**
 * 🔄 Met à jour ou fusionne l'état réactif d'un post dans le Shadow Cache.
 */
export function updatePostShadow(postId: string, newState: Partial<PostShadowState>) {
  if (!postId) return;
  const current = shadowMap.get(postId) || {};
  const updated = { ...current, ...newState };
  shadowMap.set(postId, updated);
  notify(postId);
}

/**
 * 🔍 Obtenir l'état ombré direct pour un post ID.
 */
export function getPostShadow(postId: string): PostShadowState | undefined {
  return shadowMap.get(postId);
}

/**
 * ⚛️ Hook React souscrivant aux mises à jour atomiques d'un post.
 */
export function usePostShadow<
  T extends {
    id: string;
    likeCount?: number;
    likesCount?: number;
    repostCount?: number;
    repostsCount?: number;
    liked?: boolean;
    reposted?: boolean;
    isHiddenByAuthor?: boolean;
  },
>(post: T): T {
  const postId = post.id;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!postId) return;

    if (!listenersMap.has(postId)) {
      listenersMap.set(postId, new Set());
    }

    const set = listenersMap.get(postId)!;
    const listener = () => setTick((t) => t + 1);
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        listenersMap.delete(postId);
      }
    };
  }, [postId]);

  const shadow = shadowMap.get(postId);

  if (!shadow) {
    return post;
  }

  const initialLikesCount = post.likesCount ?? post.likeCount ?? 0;
  const initialRepostsCount = post.repostsCount ?? post.repostCount ?? 0;

  return {
    ...post,
    liked: shadow.liked !== undefined ? shadow.liked : post.liked,
    likesCount: shadow.likesCount !== undefined ? shadow.likesCount : initialLikesCount,
    reposted: shadow.reposted !== undefined ? shadow.reposted : post.reposted,
    repostsCount: shadow.repostsCount !== undefined ? shadow.repostsCount : initialRepostsCount,
    isHiddenByAuthor:
      shadow.isHiddenByAuthor !== undefined ? shadow.isHiddenByAuthor : post.isHiddenByAuthor,
  };
}
