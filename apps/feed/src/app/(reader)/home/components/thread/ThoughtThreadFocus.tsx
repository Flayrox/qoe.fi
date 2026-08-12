"use client"

import React from "react"
import { pinPostAction, unpinPostAction, toggleFollowCreatorHomeAction } from "@qoe/api-client/actions/feed"
import { useOptimisticFollow } from "@qoe/api-client/hooks/useOptimisticFollow"
import { toast } from "sonner"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export function ThoughtThreadFocus() {
  const {
    post,
    currentUserId,
    toggleLike,
    repostThought,
    deleteThought,
    setLightboxImage,
    onOpenPost,
    onOpenProfile,
    onOpenArticle,
  } = useThoughtThreadContext()

  const { mutate: toggleFollow } = useOptimisticFollow({
    onError: (err) => {
      toast.error(err.message || "Erreur lors de la modification de l'abonnement.")
    }
  })

  const [localFollowing, setLocalFollowing] = React.useState<boolean>(false)

  React.useEffect(() => {
    if (post) {
      setLocalFollowing(Boolean((post as any).isFollowingAuthor))
    }
  }, [post, (post as any)?.isFollowingAuthor])

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

  const handleFollowToggle = () => {
    const isCurrentlyFollowing = localFollowing
    setLocalFollowing(!isCurrentlyFollowing)

    toggleFollow({
      creatorId: post.author.id,
      isFollowedCurrent: isCurrentlyFollowing,
      followMutationFn: async (creatorId) => {
        const res = await toggleFollowCreatorHomeAction(creatorId)
        if (res?.ok) {
          toast.success(res.data.followed ? "Vous suivez maintenant ce créateur." : "Abonnement retiré.")
          return { success: true }
        }
        return { success: false, message: "Impossible de modifier l'abonnement." }
      }
    })
  }

  return (
    <ThoughtCard
      post={post}
      variant="focus"
      isThreadChild={Boolean(post.parent)}
      currentUserId={currentUserId}
      knownLikers={(post as any).knownLikers}
      knownLikersTotal={(post as any).knownLikersTotal}
      isFollowingAuthor={localFollowing}
      onFollowToggle={handleFollowToggle}
      onOpenProfile={onOpenProfile}
      onOpenPost={onOpenPost}
      onOpenArticle={onOpenArticle}
      onOpenMedia={(url) => setLightboxImage(url)}
      onLikeToggle={() => toggleLike(post.id)}
      onRepostToggle={() => repostThought(post.id)}
      onPinToggle={handlePinToggle}
      onDeletePost={async () => deleteThought(post.id)}
    />
  )
}

