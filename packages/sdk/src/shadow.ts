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

// =====================================================================
// 📰 Article Shadow Store
// =====================================================================

export interface ArticleShadow {
  liked?: boolean;
  likesCount?: number;
  reposted?: boolean;
  repostsCount?: number;
  bookmarked?: boolean;
}

const articleShadows = new Map<string, ArticleShadow>();
const articleListeners = new Map<string, Set<() => void>>();

function subscribeArticle(id: string, fn: () => void) {
  let set = articleListeners.get(id);
  if (!set) {
    set = new Set();
    articleListeners.set(id, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) articleListeners.delete(id);
  };
}

function notifyArticle(id: string) {
  const set = articleListeners.get(id);
  if (set) set.forEach((fn) => fn());
}

export function updateArticleShadow(id: string, patch: Partial<ArticleShadow>): void {
  if (!id) return;
  articleShadows.set(id, { ...articleShadows.get(id), ...patch });
  notifyArticle(id);
}

export function getArticleShadow(id: string): ArticleShadow | undefined {
  if (!id) return undefined;
  return articleShadows.get(id);
}

export function useArticleShadow<
  T extends {
    id?: string;
    liked?: boolean;
    likesCount?: number;
    reposted?: boolean;
    repostsCount?: number;
    isBookmarked?: boolean;
  },
>(article: T): T {
  const articleId = article?.id;
  const [shadow, setShadow] = useState<ArticleShadow | undefined>(() =>
    articleId ? articleShadows.get(articleId) : undefined
  );

  useEffect(() => {
    if (!articleId) return;
    setShadow(articleShadows.get(articleId));
    return subscribeArticle(articleId, () => setShadow(articleShadows.get(articleId)));
  }, [articleId]);

  return useMemo(() => {
    if (!article || !articleId || !shadow) return article;
    return mergeArticleShadow(article, shadow);
  }, [article, articleId, shadow]);
}

type LikeableArticle = {
  id?: string;
  liked?: boolean;
  likesCount?: number;
  reposted?: boolean;
  repostsCount?: number;
  isBookmarked?: boolean;
  bookmarked?: boolean;
};

function mergeArticleShadow<T extends LikeableArticle>(article: T, shadow: ArticleShadow): T {
  const result: LikeableArticle = { ...article };

  const baseLikesCount = article.likesCount ?? 0;
  if (typeof shadow.liked === 'boolean') {
    const wasLiked = !!article.liked;
    const isLiked = shadow.liked;
    result.liked = isLiked;
    if (typeof shadow.likesCount === 'number') {
      result.likesCount = shadow.likesCount;
    } else if (wasLiked !== isLiked) {
      result.likesCount = isLiked ? baseLikesCount + 1 : Math.max(0, baseLikesCount - 1);
    }
  } else if (typeof shadow.likesCount === 'number') {
    result.likesCount = shadow.likesCount;
  }

  const baseRepostsCount = article.repostsCount ?? 0;
  if (typeof shadow.reposted === 'boolean') {
    const wasReposted = !!article.reposted;
    const isReposted = shadow.reposted;
    result.reposted = isReposted;
    if (typeof shadow.repostsCount === 'number') {
      result.repostsCount = shadow.repostsCount;
    } else if (wasReposted !== isReposted) {
      result.repostsCount = isReposted ? baseRepostsCount + 1 : Math.max(0, baseRepostsCount - 1);
    }
  } else if (typeof shadow.repostsCount === 'number') {
    result.repostsCount = shadow.repostsCount;
  }

  if (typeof shadow.bookmarked === 'boolean') {
    result.isBookmarked = shadow.bookmarked;
    result.bookmarked = shadow.bookmarked;
  }

  return result as T;
}

// =====================================================================
// 👤 Actor Shadow Store
// =====================================================================

export interface ActorShadow {
  followed?: boolean;
  followRequested?: boolean;
  blocked?: boolean;
}

const actorShadows = new Map<string, ActorShadow>();
const actorListeners = new Map<string, Set<() => void>>();

function cleanActorKey(idOrHandle: string): string {
  return idOrHandle.trim().toLowerCase().replace(/^@/, '');
}

function subscribeActor(key: string, fn: () => void) {
  let set = actorListeners.get(key);
  if (!set) {
    set = new Set();
    actorListeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) actorListeners.delete(key);
  };
}

function notifyActor(key: string) {
  const set = actorListeners.get(key);
  if (set) set.forEach((fn) => fn());
}

export function updateActorShadow(idOrHandle: string, patch: Partial<ActorShadow>): void {
  if (!idOrHandle) return;
  const key = cleanActorKey(idOrHandle);
  actorShadows.set(key, { ...actorShadows.get(key), ...patch });
  notifyActor(key);
}

export function getActorShadow(idOrHandle: string): ActorShadow | undefined {
  if (!idOrHandle) return undefined;
  return actorShadows.get(cleanActorKey(idOrHandle));
}

export function useActorShadow<
  T extends {
    id?: string;
    username?: string | null;
    isFollowed?: boolean;
    viewerFollows?: boolean;
  },
>(actor: T): T {
  const idKey = actor?.id ? cleanActorKey(actor.id) : undefined;
  const usernameKey = actor?.username ? cleanActorKey(actor.username) : undefined;

  const [shadow, setShadow] = useState<ActorShadow | undefined>(() => {
    return (
      (idKey ? actorShadows.get(idKey) : undefined) ??
      (usernameKey ? actorShadows.get(usernameKey) : undefined)
    );
  });

  useEffect(() => {
    const keys = Array.from(new Set([idKey, usernameKey].filter(Boolean))) as string[];
    if (keys.length === 0) return;

    const resolve = () => {
      const s =
        (idKey ? actorShadows.get(idKey) : undefined) ??
        (usernameKey ? actorShadows.get(usernameKey) : undefined);
      setShadow(s);
    };

    resolve();
    const unsubs = keys.map((k) => subscribeActor(k, resolve));
    return () => unsubs.forEach((u) => u());
  }, [idKey, usernameKey]);

  return useMemo(() => {
    if (!actor || (!idKey && !usernameKey) || !shadow) return actor;
    return mergeActorShadow(actor, shadow);
  }, [actor, idKey, usernameKey, shadow]);
}

type ShadowableActor = {
  id?: string;
  username?: string | null;
  isFollowed?: boolean;
  viewerFollows?: boolean;
  followRequested?: boolean;
  isFollowRequested?: boolean;
  blocked?: boolean;
  isBlocked?: boolean;
};

function mergeActorShadow<T extends ShadowableActor>(actor: T, shadow: ActorShadow): T {
  const result: ShadowableActor = { ...actor };

  if (typeof shadow.followed === 'boolean') {
    result.isFollowed = shadow.followed;
    result.viewerFollows = shadow.followed;
  }

  if (typeof shadow.followRequested === 'boolean') {
    result.followRequested = shadow.followRequested;
    result.isFollowRequested = shadow.followRequested;
  }

  if (typeof shadow.blocked === 'boolean') {
    result.blocked = shadow.blocked;
    result.isBlocked = shadow.blocked;
  }

  return result as T;
}
