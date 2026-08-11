"use client"

import React from "react"
import { ThoughtCard, type ThoughtCardProps } from "@qoe/ui"
import { useOptimisticLike } from "../hooks/useOptimisticLike"
import { useOptimisticRepost } from "../hooks/useOptimisticRepost"
import { unfurlUrlAction } from "../actions/feed"

export interface ThoughtCardContainerProps extends Omit<ThoughtCardProps, "onLikeToggle" | "onRepostToggle"> {
  likeMutationFn?: (thoughtId: string, isLikedCurrent: boolean) => Promise<{ success: boolean; message?: string }>
  repostMutationFn?: (thoughtId: string, isRepostedCurrent: boolean) => Promise<{ success: boolean; message?: string }>
  onLikeToggleOverride?: (postId: string) => void
  onRepostToggleOverride?: (postId: string) => void
}

export function ThoughtCardContainer({
  post,
  likeMutationFn,
  repostMutationFn,
  onLikeToggleOverride,
  onRepostToggleOverride,
  unfurlFn,
  ...restProps
}: ThoughtCardContainerProps) {
  const optimisticLike = useOptimisticLike()
  const optimisticRepost = useOptimisticRepost()

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (onLikeToggleOverride) {
      onLikeToggleOverride(post.id)
      return
    }

    if (likeMutationFn) {
      optimisticLike.mutate({
        thoughtId: post.id,
        isLikedCurrent: !!post.liked,
        likeMutationFn,
      })
    }
  }

  const handleRepostToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (onRepostToggleOverride) {
      onRepostToggleOverride(post.id)
      return
    }

    if (repostMutationFn) {
      optimisticRepost.mutate({
        thoughtId: post.id,
        isRepostedCurrent: !!post.reposted,
        repostMutationFn,
      })
    }
  }

  const defaultUnfurlFn = React.useCallback(async (url: string) => {
    try {
      const res = await unfurlUrlAction(url)
      return res.ok ? res.data : null
    } catch {
      return null
    }
  }, [])

  return (
    <ThoughtCard
      post={post}
      onLikeToggle={handleLikeToggle}
      onRepostToggle={handleRepostToggle}
      unfurlFn={unfurlFn || defaultUnfurlFn}
      {...restProps}
    />
  )
}
