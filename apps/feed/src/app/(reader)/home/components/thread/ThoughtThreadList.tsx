"use client"

import React from "react"
import { ThoughtThreadItem } from "./ThoughtThreadItem"
import { ThoughtThreadTombstone } from "./ThoughtThreadTombstone"
import { useThoughtThreadContext, type OptimisticThought } from "./ThoughtThreadContext"

export interface ThoughtThreadListProps {
  children?: (item: OptimisticThought) => React.ReactNode
}

export function ThoughtThreadList({ children }: ThoughtThreadListProps) {
  const { post, loading } = useThoughtThreadContext()

  if (loading) {
    return (
      <div className="py-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-md bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!post || !post.replies || post.replies.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground font-sans">
        Soyez le premier à exprimer une réponse.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/20 pt-2 font-sans">
      {post.replies.map((reply) => {
        if (children) return children(reply)

        if (reply.isDeleted) {
          return <ThoughtThreadTombstone key={reply.id} />
        }

        return <ThoughtThreadItem key={reply.id} reply={reply} />
      })}
    </div>
  )
}
