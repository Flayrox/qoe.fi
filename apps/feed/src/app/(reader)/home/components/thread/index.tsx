"use client"

import React from "react"
import { ThoughtThreadRoot, type ThoughtThreadRootProps } from "./ThoughtThreadRoot"
import { ThoughtThreadParentContext } from "./ThoughtThreadParentContext"
import { ThoughtThreadFocus } from "./ThoughtThreadFocus"
import { ThoughtThreadComposer, type ThoughtThreadComposerProps } from "./ThoughtThreadComposer"
import { ThoughtThreadList, type ThoughtThreadListProps } from "./ThoughtThreadList"
import { ThoughtThreadItem, type ThoughtThreadItemProps } from "./ThoughtThreadItem"
import { ThoughtThreadTombstone, type ThoughtThreadTombstoneProps } from "./ThoughtThreadTombstone"
import { ThoughtThreadLightbox } from "./ThoughtThreadLightbox"
import { useThoughtThreadContext, type OptimisticThought } from "./ThoughtThreadContext"

export const ThoughtThread = {
  Root: ThoughtThreadRoot,
  ParentContext: ThoughtThreadParentContext,
  Focus: ThoughtThreadFocus,
  Composer: ThoughtThreadComposer,
  List: ThoughtThreadList,
  Item: ThoughtThreadItem,
  Tombstone: ThoughtThreadTombstone,
  Lightbox: ThoughtThreadLightbox,
}

export type {
  ThoughtThreadRootProps,
  ThoughtThreadComposerProps,
  ThoughtThreadListProps,
  ThoughtThreadItemProps,
  ThoughtThreadTombstoneProps,
  OptimisticThought,
}

export { useThoughtThreadContext }

/**
 * 🏛️ Backward-Compatible Wrapper for ThoughtThreadView
 */
export function ThoughtThreadView({
  postId,
  currentUserId,
  initialPost = null,
  standalone = false,
  onClose,
  onOpenProfile,
  onOpenArticle,
  onInteractionUpdate,
  onLoginRequired,
}: {
  postId: string
  currentUserId: string | null
  initialPost?: any
  standalone?: boolean
  onClose?: () => void
  onOpenProfile?: (username: string) => void
  onOpenArticle?: (article: any) => void
  onInteractionUpdate?: (postId: string, update: { liked?: boolean; likesCount?: number; repliesCount?: number }) => void
  onLoginRequired?: () => void
}) {
  return (
    <ThoughtThread.Root
      postId={postId}
      currentUserId={currentUserId}
      initialPost={initialPost}
      onClose={onClose}
      onOpenProfile={onOpenProfile}
      onOpenArticle={onOpenArticle}
      onInteractionUpdate={onInteractionUpdate}
      onLoginRequired={onLoginRequired}
    >
      <div className="relative space-y-2">
        <ThoughtThread.ParentContext />
        <ThoughtThread.Focus />
        <ThoughtThread.Composer placeholder="Exprimer une réponse..." />
        <ThoughtThread.List />
        <ThoughtThread.Lightbox />
      </div>
    </ThoughtThread.Root>
  )
}
