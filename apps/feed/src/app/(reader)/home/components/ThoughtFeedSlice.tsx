"use client"

import React from "react"
import { MessageSquare } from "lucide-react"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import type { FeedSlice } from "@qoe/api-client/actions/feed"

export interface ThoughtFeedSliceProps {
  slice: FeedSlice | any
  currentUserId?: string | null
  onOpenPost?: (postId: string, authorHandle?: string) => void
  onOpenProfile?: (handle: string) => void
  onOpenArticle?: (article: { id: string; slug: string; title: string }) => void
  onOpenMedia?: (url: string) => void
  onLikeToggle?: (id: string) => void
  onRepostToggle?: (id: string) => void
  onReportClick?: (postId: string) => void
  onPinToggle?: (postId: string) => void
  onHideReplyToggle?: (postId: string) => void
  onBlockUserToggle?: (authorId: string) => void
}

export function ThoughtFeedSlice({
  slice,
  currentUserId,
  onOpenPost,
  onOpenProfile,
  onOpenArticle,
  onOpenMedia,
  onLikeToggle,
  onRepostToggle,
  onReportClick,
  onPinToggle,
  onHideReplyToggle,
  onBlockUserToggle,
}: ThoughtFeedSliceProps) {
  // If no parent/root post in slice, render as standalone post card
  if (!slice || (!slice.parentPost && !slice.rootPost)) {
    const post = slice?.targetPost || slice
    return (
      <ThoughtCard
        post={post}
        variant="timeline"
        currentUserId={currentUserId}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onOpenArticle={onOpenArticle}
        onOpenMedia={onOpenMedia}
        onLikeToggle={onLikeToggle}
        onRepostToggle={onRepostToggle}
        onReportClick={onReportClick ? () => onReportClick(post.id) : undefined}
        onPinToggle={onPinToggle ? () => onPinToggle(post.id) : undefined}
        onHideReplyToggle={onHideReplyToggle ? () => onHideReplyToggle(post.id) : undefined}
        onBlockUserToggle={onBlockUserToggle ? () => onBlockUserToggle(post.author?.id) : undefined}
      />
    )
  }

  const { rootPost, parentPost, targetPost, isIncompleteThread } = slice

  return (
    <div className="border-b border-border/40 divide-y-0 font-sans">
      {/* 1. Root Post */}
      {rootPost && (
        <ThoughtCard
          post={rootPost}
          variant="parent"
          isThreadParent={true}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={onOpenMedia}
          onLikeToggle={onLikeToggle}
          onRepostToggle={onRepostToggle}
        />
      )}

      {/* 2. Incomplete Thread Divider ("Afficher plus de réponses") */}
      {isIncompleteThread && rootPost && parentPost && (
        <div
          className="relative flex items-center gap-3 px-4 py-2 bg-card/20 text-xs text-brand font-medium hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() => onOpenPost && onOpenPost(rootPost.id)}
        >
          <div className="w-10 sm:w-[42px] flex justify-center shrink-0">
            <div className="w-[2px] h-full bg-border/40 border-dashed border-l border-border/60" />
          </div>
          <div className="flex items-center gap-1.5 py-1">
            <MessageSquare className="w-3.5 h-3.5 text-brand" />
            <span>Afficher plus de réponses</span>
          </div>
        </div>
      )}

      {/* 3. Direct Parent Post */}
      {parentPost && parentPost.id !== rootPost?.id && (
        <ThoughtCard
          post={parentPost}
          variant="parent"
          isThreadParent={true}
          isThreadChild={Boolean(rootPost)}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={onOpenMedia}
          onLikeToggle={onLikeToggle}
          onRepostToggle={onRepostToggle}
        />
      )}

      {/* 4. Target Reply Post */}
      {targetPost && (
        <ThoughtCard
          post={targetPost}
          variant="reply"
          isThreadChild={true}
          isThreadLastChild={true}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={onOpenMedia}
          onLikeToggle={onLikeToggle}
          onRepostToggle={onRepostToggle}
          onReportClick={onReportClick ? () => onReportClick(targetPost.id) : undefined}
          onPinToggle={onPinToggle ? () => onPinToggle(targetPost.id) : undefined}
          onHideReplyToggle={onHideReplyToggle ? () => onHideReplyToggle(targetPost.id) : undefined}
          onBlockUserToggle={onBlockUserToggle ? () => onBlockUserToggle(targetPost.author?.id) : undefined}
        />
      )}
    </div>
  )
}
