'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { updatePostShadow } from '@qoe/sdk';
import {
  getPostThreadAction as getPostThread,
  getPostThreadRepliesAction as getPostThreadReplies,
  toggleLikePostAction as toggleLikePost,
  deletePostAction as deletePost,
  toggleRepostPostAction as toggleRepostPost,
} from '@qoe/sdk/actions/feed';
import { mergeThreadReplies } from '@qoe/sdk/actions/feed/mappers';

import { routes } from '@qoe/config/routes';
import { trackEvent } from '@/lib/analytics';
import {
  ThoughtThreadProvider,
  type OptimisticThought,
  type ThoughtThreadContextValue,
} from './ThoughtThreadContext';
import type { DbUser } from '../ThoughtComposer';
import { useThoughtOverlay } from '@/components/thought-overlay/context';

export interface ThoughtThreadRootProps {
  postId: string;
  currentUserId: string | null;
  dbUser?: DbUser | null;
  initialPost?: OptimisticThought | null;
  standalone?: boolean;
  onClose?: () => void;
  onOpenProfile?: (username: string) => void;
  onOpenArticle?: (article: { id: string; slug: string; title: string }) => void;
  onInteractionUpdate?: (
    postId: string,
    update: { liked?: boolean; likesCount?: number; repliesCount?: number }
  ) => void;
  onLoginRequired?: () => void;
  children: React.ReactNode;
}

/** Parcourt l'arbre du fil (parent + réponses) et transforme chaque nœud. */
function mapThoughtTree(
  node: OptimisticThought,
  transform: (node: OptimisticThought) => OptimisticThought
): OptimisticThought {
  const next = transform(node);
  return {
    ...next,
    parent: next.parent ? mapThoughtTree(next.parent, transform) : next.parent,
    replies: next.replies
      ? next.replies.map((child) => mapThoughtTree(child, transform))
      : next.replies,
  };
}

/** Retrouve un nœud du fil par son id (racine, chaîne parent ou réponse). */
function findThought(node: OptimisticThought, id: string): OptimisticThought | null {
  if (node.id === id) return node;
  if (node.parent) {
    const foundParent = findThought(node.parent, id);
    if (foundParent) return foundParent;
  }
  for (const child of node.replies ?? []) {
    const foundChild = findThought(child, id);
    if (foundChild) return foundChild;
  }
  return null;
}

export function ThoughtThreadRoot({
  postId,
  currentUserId,
  dbUser,
  initialPost = null,
  standalone = false,
  onClose,
  onOpenProfile,
  onOpenArticle,
  onInteractionUpdate,
  onLoginRequired,
  children,
}: ThoughtThreadRootProps) {
  const thoughtOverlay = useThoughtOverlay();
  const [post, setPost] = useState<OptimisticThought | null>(initialPost);
  const [loading, setLoading] = useState(!initialPost);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  // Le fil est paginé côté serveur : on garde le curseur à part du post pour
  // ne pas le faire voyager dans les mutations optimistes (like, suppression).
  const [repliesPage, setRepliesPage] = useState<{ cursor: string | null; hasMore: boolean }>({
    cursor: null,
    hasMore: false,
  });
  const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);

  // Load thread on mount or when postId changes
  useEffect(() => {
    if (initialPost && initialPost.id === postId) {
      setPost(initialPost);
      setRepliesPage({ cursor: null, hasMore: false });
      setLoading(false);
      return;
    }

    async function loadThread() {
      setLoading(true);
      // Une panne réseau ne doit pas laisser le squelette tourner à l'infini :
      // on retombe sur l'état vide, et `finally` éteint le chargement.
      try {
        const res = await getPostThread(postId);
        if (res.ok && res.data?.post) {
          const postData = res.data.post;
          const userHasLiked =
            typeof postData.liked === 'boolean'
              ? postData.liked
              : postData.likes?.some((l: { userId: string }) => l.userId === currentUserId);
          setPost({
            ...postData,
            liked: userHasLiked,
            likesCount:
              typeof postData.likesCount === 'number'
                ? postData.likesCount
                : postData.likes?.length || 0,
          });
          setRepliesPage({
            cursor: postData.repliesCursor || null,
            hasMore: Boolean(postData.repliesTruncated),
          });

          // 🎯 Synchroniser l'URL si elle utilisait le fallback générique /auteur/thought/:id
          const realHandle = postData.author?.username || postData.author?.id;
          if (realHandle && typeof window !== 'undefined') {
            const currentPath = window.location.pathname;
            if (
              currentPath.includes('/auteur/thought/') ||
              currentPath.includes('/author/thought/')
            ) {
              const newUrl = routes.feed.thought(realHandle, postData.id);
              window.history.replaceState(window.history.state, '', newUrl);
            }
          }
        } else {
          setPost(null);
          setRepliesPage({ cursor: null, hasMore: false });
        }
      } catch {
        setPost(null);
        setRepliesPage({ cursor: null, hasMore: false });
      } finally {
        setLoading(false);
      }
    }

    loadThread();
  }, [postId, currentUserId, initialPost]);

  // ESC Key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, onClose]);

  // Navigation handler
  const handleOpenPost = useCallback(
    (targetPostId: string, authorUsername?: string) => {
      const handle =
        authorUsername ||
        post?.author?.username ||
        post?.author?.subdomain ||
        post?.author?.id ||
        'author';

      if (standalone) {
        // Dans la surcouche : remplacer le fil affiché, sans navigation.
        // Sur la page permalien (aucun provider) : navigation classique.
        if (thoughtOverlay) {
          thoughtOverlay.openThought(targetPostId, handle);
        } else {
          window.location.href = routes.feed.thought(handle, targetPostId);
        }
        return;
      }

      const newUrl = routes.feed.thought(handle, targetPostId);
      window.history.pushState({ postId: targetPostId }, '', newUrl);

      setLoading(true);
      // Même contrat que le chargement initial : échec → état vide, jamais un
      // squelette sans fin (le `catch` évite aussi une rejet non gérée).
      getPostThread(targetPostId)
        .then((res) => {
          if (res.ok && res.data?.post) {
            const p = res.data.post;
            const userHasLiked =
              typeof p.liked === 'boolean'
                ? p.liked
                : p.likes?.some((l: { userId: string }) => l.userId === currentUserId);
            setPost({
              ...p,
              liked: userHasLiked,
              likesCount: typeof p.likesCount === 'number' ? p.likesCount : p.likes?.length || 0,
            });
            setRepliesPage({
              cursor: p.repliesCursor || null,
              hasMore: Boolean(p.repliesTruncated),
            });
          } else {
            setPost(null);
            setRepliesPage({ cursor: null, hasMore: false });
          }
        })
        .catch(() => {
          setPost(null);
          setRepliesPage({ cursor: null, hasMore: false });
        })
        .finally(() => setLoading(false));
    },
    [post, currentUserId, standalone, thoughtOverlay]
  );

  // 0ms Optimistic Like Handler with Rollback
  // L'état visé est calculé AVANT `setPost` : React peut différer ou rejouer un
  // updater, et lire ses variables après coup donnerait au parent (et au
  // rollback) un état périmé.
  const handleToggleLike = useCallback(
    async (targetId: string) => {
      if (!currentUserId) {
        if (onLoginRequired) onLoginRequired();
        return;
      }
      if (!post) return;

      const target = findThought(post, targetId);
      if (!target) return;

      const previousPostSnapshot = structuredClone(post);
      const targetNewLiked = !target.liked;
      const previousCount = target.likesCount || 0;
      const targetNewCount = targetNewLiked ? previousCount + 1 : Math.max(0, previousCount - 1);

      setPost(
        mapThoughtTree(post, (node) =>
          node.id === targetId
            ? { ...node, liked: targetNewLiked, likesCount: targetNewCount }
            : node
        )
      );

      if (onInteractionUpdate) {
        onInteractionUpdate(targetId, { liked: targetNewLiked, likesCount: targetNewCount });
      }

      trackEvent('thought_like', { targetId });

      const res = await toggleLikePost(targetId);
      if (!res.ok) {
        setPost(previousPostSnapshot);
        if (onInteractionUpdate) {
          onInteractionUpdate(targetId, { liked: target.liked, likesCount: previousCount });
        }
        toast.error(res.error?.message || t`Action impossible`);
      }
    },
    [post, currentUserId, onInteractionUpdate, onLoginRequired]
  );

  // 0ms Optimistic Repost Handler with Rollback (même règle : aucun calcul
  // d'état dans l'updater).
  const handleRepostThought = useCallback(
    async (targetId: string) => {
      if (!currentUserId) {
        if (onLoginRequired) onLoginRequired();
        return;
      }
      if (!post) return;

      const target = findThought(post, targetId);
      if (!target) return;

      const previousPostSnapshot = structuredClone(post);
      const isReposted = !target.reposted;
      const previousCount = target.repostsCount || 0;
      const nextCount = isReposted ? previousCount + 1 : Math.max(0, previousCount - 1);

      setPost(
        mapThoughtTree(post, (node) =>
          node.id === targetId ? { ...node, reposted: isReposted, repostsCount: nextCount } : node
        )
      );

      trackEvent('thought_repost', { targetId });

      const res = await toggleRepostPost(targetId);
      if (!res.ok) {
        setPost(previousPostSnapshot);
        toast.error(res.error?.message || t`Impossible de repartager la pensée.`);
      } else {
        toast.success(res.data?.reposted ? t`Pensée repartagée !` : t`Repartage annulé.`);
      }
    },
    [post, currentUserId, onLoginRequired]
  );

  // Charge la page suivante de réponses (fil paginé L42). Les réponses
  // arrivent à plat, ordonnées : la fusion les rattache à leur parent déjà
  // affiché, sans reconstruire ni recharger tout le fil.
  const handleLoadMoreReplies = useCallback(async () => {
    if (!post || loadingMoreReplies || !repliesPage.hasMore) return;
    setLoadingMoreReplies(true);
    try {
      const res = await getPostThreadReplies({ postId: post.id, cursor: repliesPage.cursor });
      if (!res.ok) {
        toast.error(res.error.message || t`Impossible de charger la suite du fil.`);
        return;
      }
      setPost((prev) => (prev ? mergeThreadReplies(prev, res.data.replies).root : prev));
      setRepliesPage({
        cursor: res.data.nextCursor || null,
        // Un `hasMore` sans curseur boucherait sur une boucle de requêtes.
        hasMore: res.data.hasMore && Boolean(res.data.nextCursor),
      });
    } catch {
      toast.error(t`Impossible de charger la suite du fil.`);
    } finally {
      setLoadingMoreReplies(false);
    }
  }, [post, loadingMoreReplies, repliesPage]);

  // Insert a server reply directly into the thread tree (no API call)
  const handleInsertReply = useCallback((parentId: string, reply: OptimisticThought) => {
    setPost((prevPost) => {
      if (!prevPost) return null;

      const appendReply = (item: OptimisticThought): OptimisticThought => {
        if (item.id === parentId) {
          // Avoid duplicates: if the reply is already in the tree, skip
          const alreadyPresent = (item.replies || []).some((r) => r.id === reply.id);
          if (alreadyPresent) return item;
          return {
            ...item,
            repliesCount: (item.repliesCount || 0) + 1,
            replies: [reply, ...(item.replies || [])],
          };
        }
        return {
          ...item,
          replies: item.replies ? item.replies.map(appendReply) : [],
        };
      };

      return appendReply(prevPost);
    });
  }, []);

  // 0ms Optimistic Delete / Tombstone Handler
  const handleDeleteThought = useCallback(
    async (targetId: string): Promise<boolean> => {
      const previousPost = post ? JSON.parse(JSON.stringify(post)) : null;

      // Delete / Tombstone transformer
      const applyTombstoneOrRemove = (item: OptimisticThought): OptimisticThought | null => {
        if (item.id === targetId) {
          if (item.replies && item.replies.length > 0) {
            // Soft tombstone: keep child replies intact
            return {
              ...item,
              isDeleted: true,
              content: t`Cette pensée a été supprimée par son auteur.`,
            };
          }
          return null;
        }
        return {
          ...item,
          replies: item.replies
            ? (item.replies.map(applyTombstoneOrRemove).filter(Boolean) as OptimisticThought[])
            : [],
        };
      };

      if (post) {
        const updated = applyTombstoneOrRemove(post);
        if (!updated && post.id === targetId) {
          // Pensée racine sans réponse : on ne quitte la vue qu'après le succès
          // serveur — sinon l'utilisateur perd le fil alors qu'il existe
          // toujours (et le refus n'est jamais annoncé).
          const res = await deletePost(targetId);
          if (!res.ok) {
            toast.error(res.error?.message || 'Erreur lors de la suppression.');
            return false;
          }
          updatePostShadow(targetId, { isDeleted: true });
          toast.success(t`Pensée supprimée.`);
          if (onClose) onClose();
          else window.location.href = routes.feed.home();
          return true;
        }
        setPost(updated);
      }

      trackEvent('thought_delete', { targetId });
      const res = await deletePost(targetId);

      if (!res.ok) {
        if (previousPost) setPost(previousPost);
        toast.error('Erreur lors de la suppression.');
        return false;
      }

      updatePostShadow(targetId, { isDeleted: true });
      toast.success(t`Pensée supprimée.`);
      return true;
    },
    [post, onClose]
  );

  const contextValue: ThoughtThreadContextValue = {
    postId,
    currentUserId,
    dbUser,
    post,
    loading,
    lightboxImage,
    setLightboxImage,
    toggleLike: handleToggleLike,
    repostThought: handleRepostThought,
    insertReply: handleInsertReply,
    deleteThought: handleDeleteThought,
    repliesHasMore: repliesPage.hasMore,
    repliesLoadingMore: loadingMoreReplies,
    loadMoreReplies: handleLoadMoreReplies,
    onClose,
    onOpenProfile,
    onOpenPost: handleOpenPost,
    onOpenArticle,
    onLoginRequired,
  };

  return <ThoughtThreadProvider value={contextValue}>{children}</ThoughtThreadProvider>;
}
