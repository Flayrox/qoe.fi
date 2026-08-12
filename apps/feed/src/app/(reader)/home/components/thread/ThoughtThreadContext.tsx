"use client"

import React, { createContext, useContext } from "react"
import type { ThoughtData } from "@/components/social/ThoughtCard"

export type OptimisticThought = ThoughtData & {
  isOptimistic?: boolean
  isDeleted?: boolean
  parent?: OptimisticThought | null
  repost?: OptimisticThought | null
  replies?: OptimisticThought[]
}

export interface ThoughtThreadContextValue {
  postId: string
  currentUserId: string | null
  dbUser?: any | null
  post: OptimisticThought | null
  loading: boolean
  sendingReply: boolean
  lightboxImage: string | null
  setLightboxImage: (url: string | null) => void
  
  // Optimistic Mutation Handlers
  toggleLike: (targetId: string) => Promise<void>
  repostThought: (targetId: string) => Promise<void>
  submitReply: (parentId: string, content: string) => Promise<boolean>
  insertReply: (parentId: string, reply: OptimisticThought) => void
  deleteThought: (targetId: string) => Promise<boolean>
  
  // Navigation
  onClose?: () => void
  onOpenProfile?: (username: string) => void
  onOpenPost?: (targetPostId: string, authorUsername?: string) => void
  onOpenArticle?: (article: any) => void
  onLoginRequired?: () => void
}

const ThoughtThreadContext = createContext<ThoughtThreadContextValue | undefined>(undefined)

export function ThoughtThreadProvider({
  value,
  children,
}: {
  value: ThoughtThreadContextValue
  children: React.ReactNode
}) {
  return <ThoughtThreadContext.Provider value={value}>{children}</ThoughtThreadContext.Provider>
}

export function useThoughtThreadContext() {
  const context = useContext(ThoughtThreadContext)
  if (!context) {
    throw new Error("Les composants <ThoughtThread.*> doivent être utilisés à l'intérieur de <ThoughtThread.Root>")
  }
  return context
}
