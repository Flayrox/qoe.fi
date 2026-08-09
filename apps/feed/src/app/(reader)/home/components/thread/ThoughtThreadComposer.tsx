"use client"

import React from "react"
import { ThoughtComposer } from "../ThoughtComposer"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export interface ThoughtThreadComposerProps {
  placeholder?: string
  parentId?: string
}

export function ThoughtThreadComposer({ placeholder = "Exprimer votre réponse...", parentId }: ThoughtThreadComposerProps) {
  const { post, currentUserId, submitReply, onLoginRequired } = useThoughtThreadContext()

  const targetParentId = parentId || post?.id

  if (!targetParentId) return null

  // User object stub for ThoughtComposer avatar
  const dbUser = currentUserId ? { id: currentUserId } : null

  const handlePostCreated = (newPost: any) => {
    if (newPost && newPost.content) {
      submitReply(targetParentId, newPost.content)
    }
  }

  return (
    <div className="py-2 border-y border-border/30 font-sans my-2">
      <ThoughtComposer
        dbUser={dbUser}
        tagsList={[]}
        parentId={targetParentId}
        placeholder={placeholder}
        onPostCreated={handlePostCreated}
        onLoginRequired={onLoginRequired}
      />
    </div>
  )
}
