"use client"

import React, { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { 
  getPostThreadAction as getPostThread, 
  toggleLikePostAction as toggleLikePost, 
  replyToPostAction as replyToPost, 
  deletePostAction as deletePost, 
  toggleRepostPostAction as toggleRepostPost 
} from "@qoe/api-client/actions/feed"

import { routes } from "@qoe/config/routes"
import { trackEvent } from "@/lib/analytics"
import { ThoughtThreadProvider, type OptimisticThought, type ThoughtThreadContextValue } from "./ThoughtThreadContext"

export interface ThoughtThreadRootProps {
  postId: string
  currentUserId: string | null
  initialPost?: OptimisticThought | null
  onClose?: () => void
  onOpenProfile?: (username: string) => void
  onInteractionUpdate?: (postId: string, update: { liked?: boolean; likesCount?: number; repliesCount?: number }) => void
  onLoginRequired?: () => void
  children: React.ReactNode
}

export function ThoughtThreadRoot({
  postId,
  currentUserId,
  initialPost = null,
  onClose,
  onOpenProfile,
  onInteractionUpdate,
  onLoginRequired,
  children,
}: ThoughtThreadRootProps) {
  const [post, setPost] = useState<OptimisticThought | null>(initialPost)
  const [loading, setLoading] = useState(!initialPost)
  const [sendingReply, setSendingReply] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Load thread on mount or when postId changes
  useEffect(() => {
    if (initialPost && initialPost.id === postId) {
      setPost(initialPost)
      setLoading(false)
      return
    }

    async function loadThread() {
      setLoading(true)
      const res = await getPostThread(postId)
      if (res.ok && res.data?.post) {
        const postData = res.data.post
        const userHasLiked = postData.likes?.some((l: any) => l.userId === currentUserId)
        setPost({
          ...postData,
          liked: userHasLiked,
          likesCount: postData.likes?.length || 0,
        })
      } else {
        setPost(null)
      }
      setLoading(false)
    }

    loadThread()
  }, [postId, currentUserId, initialPost])

  // ESC Key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null)
        } else if (onClose) {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [lightboxImage, onClose])

  // Navigation handler
  const handleOpenPost = useCallback((targetPostId: string, authorUsername?: string) => {
    const handle = authorUsername || post?.author?.username || post?.author?.subdomain || post?.author?.id || "author"
    const newUrl = routes.feed.thought(handle, targetPostId)
    window.history.pushState({ postId: targetPostId }, "", newUrl)

    setLoading(true)
    getPostThread(targetPostId).then(res => {
      if (res.ok && res.data?.post) {
        const p = res.data.post
        setPost({
          ...p,
          liked: p.likes?.some((l: any) => l.userId === currentUserId),
          likesCount: p.likes?.length || 0,
        })
      }
      setLoading(false)
    })
  }, [post, currentUserId])

  // 0ms Optimistic Like Handler with Rollback
  const handleToggleLike = useCallback(async (targetId: string) => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }

    // Save snapshot for rollback
    const previousPost = post ? JSON.parse(JSON.stringify(post)) : null

    // Helper to mutate target recursively
    const mutateLike = (item: OptimisticThought): OptimisticThought => {
      if (item.id === targetId) {
        const isLiked = !item.liked
        const count = item.likesCount || 0
        return {
          ...item,
          liked: isLiked,
          likesCount: isLiked ? count + 1 : Math.max(0, count - 1),
        }
      }
      return {
        ...item,
        parent: item.parent ? mutateLike(item.parent) : null,
        replies: item.replies ? item.replies.map(mutateLike) : [],
      }
    }

    if (post) setPost(mutateLike(post))

    if (onInteractionUpdate) {
      const targetItem = post?.id === targetId ? post : post?.replies?.find(r => r.id === targetId)
      const newLiked = !targetItem?.liked
      const currentCount = targetItem?.likesCount || 0
      onInteractionUpdate(targetId, { liked: newLiked, likesCount: newLiked ? currentCount + 1 : Math.max(0, currentCount - 1) })
    }

    trackEvent("thought_like", { targetId })
    const res = await toggleLikePost(targetId)

    if (!res.ok) {
      // Rollback
      if (previousPost) setPost(previousPost)
      toast.error("Erreur lors de la mise à jour du J'aime")
    }
  }, [currentUserId, post, onInteractionUpdate, onLoginRequired])

  // 0ms Optimistic Repost Handler with Rollback
  const handleRepostThought = useCallback(async (targetId: string) => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }

    const previousPost = post ? JSON.parse(JSON.stringify(post)) : null

    const mutateRepost = (item: OptimisticThought): OptimisticThought => {
      if (item.id === targetId) {
        const isReposted = !item.reposted
        const count = item.repostsCount || 0
        return {
          ...item,
          reposted: isReposted,
          repostsCount: isReposted ? count + 1 : Math.max(0, count - 1),
        }
      }
      return {
        ...item,
        parent: item.parent ? mutateRepost(item.parent) : null,
        replies: item.replies ? item.replies.map(mutateRepost) : [],
      }
    }

    if (post) setPost(mutateRepost(post))

    trackEvent("thought_repost", { targetId })
    const res = await toggleRepostPost(targetId)

    if (!res.ok) {
      if (previousPost) setPost(previousPost)
      toast.error("Impossible de repartager la pensée.")
    } else {
      toast.success(res.data?.reposted ? "Pensée repartagée !" : "Repartage annulé.")
    }
  }, [currentUserId, post, onLoginRequired])

  // 0ms Optimistic Reply Handler
  const handleSubmitReply = useCallback(async (parentId: string, content: string): Promise<boolean> => {
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return false
    }

    if (!content.trim()) return false

    setSendingReply(true)

    // Temp Optimistic Reply Node
    const tempReplyId = "temp-" + Date.now()
    const optimisticReply: OptimisticThought = {
      id: tempReplyId,
      content,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
      likesCount: 0,
      repliesCount: 0,
      liked: false,
      author: {
        id: currentUserId,
        name: "Vous",
        username: "user",
        subdomain: null,
        logoUrl: null,
        isCertified: false,
      },
    }

    const previousPost = post ? JSON.parse(JSON.stringify(post)) : null

    // Recursive append helper
    const appendReply = (item: OptimisticThought): OptimisticThought => {
      if (item.id === parentId) {
        return {
          ...item,
          repliesCount: (item.repliesCount || 0) + 1,
          replies: [optimisticReply, ...(item.replies || [])],
        }
      }
      return {
        ...item,
        replies: item.replies ? item.replies.map(appendReply) : [],
      }
    }

    if (post) setPost(appendReply(post))

    trackEvent("thought_reply_submit", { parentId })
    const res = await replyToPost({ postId: parentId, content })
    setSendingReply(false)

    if (res.ok && res.data?.reply) {
      toast.success("Réponse publiée.")

      // Replace optimistic temp node with server response
      const serverReply: OptimisticThought = res.data.reply
      const replaceTempNode = (item: OptimisticThought): OptimisticThought => {
        return {
          ...item,
          replies: (item.replies || []).map(r => (r.id === tempReplyId ? serverReply : replaceTempNode(r))),
        }
      }

      if (post) setPost(prev => (prev ? replaceTempNode(prev) : null))
      if (onInteractionUpdate) {
        onInteractionUpdate(parentId, { repliesCount: (post?.repliesCount || 0) + 1 })
      }
      return true
    } else {
      // Rollback on failure
      if (previousPost) setPost(previousPost)
      toast.error("Erreur lors de la publication de la réponse.")
      return false
    }
  }, [currentUserId, post, onInteractionUpdate, onLoginRequired])

  // 0ms Optimistic Delete / Tombstone Handler
  const handleDeleteThought = useCallback(async (targetId: string): Promise<boolean> => {
    if (!confirm("Voulez-vous supprimer cette pensée ?")) return false

    const previousPost = post ? JSON.parse(JSON.stringify(post)) : null

    // Delete / Tombstone transformer
    const applyTombstoneOrRemove = (item: OptimisticThought): OptimisticThought | null => {
      if (item.id === targetId) {
        if (item.replies && item.replies.length > 0) {
          // Soft tombstone: keep child replies intact
          return {
            ...item,
            isDeleted: true,
            content: "Cette pensée a été supprimée par son auteur.",
          }
        }
        return null
      }
      return {
        ...item,
        replies: item.replies
          ? (item.replies.map(applyTombstoneOrRemove).filter(Boolean) as OptimisticThought[])
          : [],
      }
    }

    if (post) {
      const updated = applyTombstoneOrRemove(post)
      if (!updated && post.id === targetId) {
        // Main post deleted and had no replies -> close view
        toast.success("Pensée supprimée.")
        if (onClose) onClose()
        else window.location.href = routes.feed.home()
        await deletePost(targetId)
        return true
      }
      setPost(updated)
    }

    trackEvent("thought_delete", { targetId })
    const res = await deletePost(targetId)

    if (!res.ok) {
      if (previousPost) setPost(previousPost)
      toast.error("Erreur lors de la suppression.")
      return false
    }

    toast.success("Pensée supprimée.")
    return true
  }, [post, onClose])

  const contextValue: ThoughtThreadContextValue = {
    postId,
    currentUserId,
    post,
    loading,
    sendingReply,
    lightboxImage,
    setLightboxImage,
    toggleLike: handleToggleLike,
    repostThought: handleRepostThought,
    submitReply: handleSubmitReply,
    deleteThought: handleDeleteThought,
    onClose,
    onOpenProfile,
    onOpenPost: handleOpenPost,
    onLoginRequired,
  }

  return <ThoughtThreadProvider value={contextValue}>{children}</ThoughtThreadProvider>
}
