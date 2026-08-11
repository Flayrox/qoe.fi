"use client"

import React from "react"
import { CornerDownRight } from "lucide-react"
import { useThoughtThreadContext } from "./ThoughtThreadContext"
import { ThoughtCard } from "@/components/social/ThoughtCard"

export function ThoughtThreadParentContext() {
  const { post, onOpenPost, onOpenProfile, onOpenArticle, currentUserId, toggleLike, repostThought } = useThoughtThreadContext()

  if (!post || !post.parent) return null

  // Collect all ancestors up to top parent
  const ancestors: any[] = []
  let current: any = post.parent
  while (current) {
    ancestors.unshift(current)
    current = current.parent
  }

  const topParentAuthor = ancestors[ancestors.length - 1]?.author
  const topHandle = topParentAuthor?.username || topParentAuthor?.subdomain || "auteur"

  return (
    <div className="flex flex-col gap-0 font-sans my-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 px-1">
        <CornerDownRight className="w-3.5 h-3.5 text-brand" />
        <span>
          En réponse à <span className="text-brand font-medium">@{topHandle}</span>
        </span>
      </div>

      {ancestors.map((parent) => (
        <ThoughtCard
          key={parent.id}
          post={parent}
          variant="parent"
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onLikeToggle={(id) => toggleLike(id)}
          onRepostToggle={(id) => repostThought(id)}
        />
      ))}
    </div>
  )
}
