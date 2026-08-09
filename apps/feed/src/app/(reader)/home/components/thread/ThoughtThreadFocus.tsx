"use client"

import React from "react"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export function ThoughtThreadFocus() {
  const {
    post,
    currentUserId,
    toggleLike,
    repostThought,
    onOpenPost,
    onOpenProfile,
  } = useThoughtThreadContext()

  if (!post) return null

  if (post.isDeleted) {
    return (
      <div className="p-6 bg-muted/20 border border-border/40 rounded-xl text-center text-sm text-muted-foreground italic my-4 font-sans">
        Cette pensée a été supprimée par son auteur.
      </div>
    )
  }

  return (
    <ThoughtCard
      post={post}
      variant="focus"
      currentUserId={currentUserId}
      onOpenProfile={onOpenProfile}
      onOpenPost={onOpenPost}
      onLikeToggle={(id) => toggleLike(id)}
      onRepostToggle={(id) => repostThought(id)}
    />
  )
}
