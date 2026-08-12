"use client"

import React from "react"
import { pinPostAction, unpinPostAction } from "@qoe/api-client/actions/feed"
import { toast } from "sonner"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export function ThoughtThreadFocus() {
  const {
    post,
    currentUserId,
    toggleLike,
    repostThought,
    setLightboxImage,
    onOpenPost,
    onOpenProfile,
    onOpenArticle,
  } = useThoughtThreadContext()

  if (!post) return null

  if (post.isDeleted) {
    return (
      <div className="p-6 bg-muted/20 border border-border/40 rounded-xl text-center text-sm text-muted-foreground italic my-4 font-sans">
        Cette pensée a été supprimée par son auteur.
      </div>
    )
  }

  const handlePinToggle = async () => {
    if (post.isPinned) {
      const res = await unpinPostAction(post.id)
      if (res.ok) {
        toast.success("Pensée détachée du profil.")
        post.isPinned = false
      } else {
        toast.error("Erreur lors de la mise à jour.")
      }
    } else {
      const res = await pinPostAction(post.id)
      if (res.ok) {
        toast.success("Pensée épinglée sur le profil.")
        post.isPinned = true
      } else {
        toast.error("Erreur lors de l'épinglage.")
      }
    }
  }

  return (
    <ThoughtCard
      post={post}
      variant="focus"
      currentUserId={currentUserId}
      onOpenProfile={onOpenProfile}
      onOpenPost={onOpenPost}
      onOpenArticle={onOpenArticle}
      onOpenMedia={(url) => setLightboxImage(url)}
      onLikeToggle={() => toggleLike(post.id)}
      onRepostToggle={() => repostThought(post.id)}
      onPinToggle={handlePinToggle}
    />
  )
}
