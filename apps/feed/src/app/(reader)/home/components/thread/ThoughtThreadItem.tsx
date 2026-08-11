"use client"

import React from "react"
import { ThoughtThreadTombstone } from "./ThoughtThreadTombstone"
import { useThoughtThreadContext, type OptimisticThought } from "./ThoughtThreadContext"
import { ThoughtCard } from "@/components/social/ThoughtCard"

export interface ThoughtThreadItemProps {
  reply: OptimisticThought
  depth?: number
}

export function ThoughtThreadItem({ reply, depth = 0 }: ThoughtThreadItemProps) {
  const { currentUserId, toggleLike, repostThought, onOpenPost, onOpenProfile, onOpenArticle } = useThoughtThreadContext()

  if (reply.isDeleted) {
    return (
      <div className="space-y-1 font-sans">
        <ThoughtThreadTombstone />
        {reply.replies && reply.replies.length > 0 && (
          <div className="space-y-1 mt-1">
            {reply.replies.map((child) => (
              <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1 font-sans">
      <ThoughtCard
        post={reply}
        variant="reply"
        depth={depth}
        currentUserId={currentUserId}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onOpenArticle={onOpenArticle}
        onLikeToggle={(id) => toggleLike(id)}
        onRepostToggle={(id) => repostThought(id)}
      />

      {reply.replies && reply.replies.length > 0 && (
        <div className="space-y-1">
          {reply.replies.map((child) => (
            <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
