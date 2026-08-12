"use client"

import React from "react"
import { ThoughtCardContainer, type ThoughtCardContainerProps } from "@qoe/api-client"
import { ConfirmDeleteModal } from "@qoe/ui"
import { ModerationReportModal } from "./ModerationReportModal"
import { routes } from "@qoe/config/routes"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { 
  pinPostAction as pinPost, 
  unpinPostAction as unpinPost, 
  toggleLikePostAction as toggleLikePost, 
  toggleRepostPostAction as toggleRepostPost 
} from "@qoe/api-client/actions/feed"
import { PollCard } from "./PollCard"
import { ThreadgateBadge } from "./ThreadgateBadge"
import { HiddenReplyCard } from "./HiddenReplyCard"

export type { ThoughtData, ThoughtVariant } from "@qoe/ui"

export interface FeedThoughtCardProps extends Omit<ThoughtCardContainerProps, "likeMutationFn" | "repostMutationFn"> {
  onOpenProfile?: (username: string) => void
  onOpenPost?: (postId: string, authorUsername?: string) => void
  onLikeToggle?: (postId: string) => void
  onRepostToggle?: (postId: string) => void
  onDeletePost?: (postId: string) => Promise<boolean> | void
}

export function ThoughtCard({
  post,
  variant = "timeline",
  depth = 0,
  currentUserId: propUserId,
  onOpenProfile,
  onOpenPost,
  onLikeToggle,
  onRepostToggle,
  onDeletePost,
  className,
  ...restProps
}: FeedThoughtCardProps) {
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(propUserId || null)
  const [showReportModal, setShowReportModal] = React.useState<boolean>(false)
  const [confirmDeletePostId, setConfirmDeletePostId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (propUserId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id)
      }
    })
  }, [propUserId])

  const authorHandle = post.author?.username || post.author?.subdomain || post.author?.id?.slice(0, 8) || "auteur"

  const handleOpenProfile = (username: string) => {
    if (onOpenProfile) {
      onOpenProfile(username)
    } else {
      window.location.href = routes.feed.profile(username)
    }
  }

  const handleOpenPost = (postId: string, author?: string) => {
    if (variant === "focus") return
    if (onOpenPost) {
      onOpenPost(postId, author || authorHandle)
    }
  }

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      if (post.isPinned) {
        const res = await unpinPost(post.id)
        if (res.ok) toast.success("Pensée désépinglée du profil.")
      } else {
        const res = await pinPost(post.id)
        if (res.ok) toast.success("Pensée épinglée sur le profil.")
      }
    } catch {
      toast.error("Erreur lors de la modification de l'état épinglé.")
    }
  }

  const handleLikeToggleOverride = onLikeToggle ? (id: string) => onLikeToggle(id) : undefined
  const handleRepostToggleOverride = onRepostToggle ? (id: string) => onRepostToggle(id) : undefined

  const handleReplyClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (restProps.onReplyClick) {
      restProps.onReplyClick(e)
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-composer", { detail: { replyToThought: post } }))
    }
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setConfirmDeletePostId(post.id)
  }

  const pollSlot = post.poll ? <PollCard poll={post.poll} /> : null
  const threadgateBadge = post.replyRestriction && post.replyRestriction !== "everyone" ? (
    <ThreadgateBadge restriction={post.replyRestriction as any} />
  ) : null

  const isHidden = (post as any).isHiddenByAuthor === true
  const isParentAuthor = currentUserId === post.parent?.author.id

  const cardElement = (
    <ThoughtCardContainer
      post={post}
      variant={variant}
      depth={depth}
      currentUserId={currentUserId}
      pollSlot={pollSlot}
      threadgateBadge={threadgateBadge}
      onOpenProfile={handleOpenProfile}
      onOpenPost={handleOpenPost}
      onReplyClick={handleReplyClick}
      onPinToggle={handlePinToggle}
      onReportClick={() => setShowReportModal(true)}
      onDeleteClick={onDeletePost ? handleDeleteClick : undefined}
      onLikeToggleOverride={handleLikeToggleOverride}
      onRepostToggleOverride={handleRepostToggleOverride}
      likeMutationFn={async (id) => {
        const res = await toggleLikePost(id)
        const msg = res.ok ? undefined : typeof res.error === "string" ? res.error : res.error?.message
        return { success: res.ok, message: msg }
      }}
      repostMutationFn={async (id) => {
        const res = await toggleRepostPost(id)
        const msg = res.ok ? undefined : typeof res.error === "string" ? res.error : res.error?.message
        return { success: res.ok, message: msg }
      }}
      className={className}
      {...restProps}
    />
  )

  return (
    <>
      {isHidden ? (
        <HiddenReplyCard replyId={post.id} isHiddenByAuthor={true} isParentAuthor={isParentAuthor}>
          {cardElement}
        </HiddenReplyCard>
      ) : (
        cardElement
      )}

      <ModerationReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={post.id}
        targetType="thought"
      />

      <ConfirmDeleteModal
        isOpen={confirmDeletePostId === post.id}
        onClose={() => setConfirmDeletePostId(null)}
        onConfirm={() => {
          if (confirmDeletePostId) return onDeletePost?.(confirmDeletePostId)
        }}
      />
    </>
  )
}
