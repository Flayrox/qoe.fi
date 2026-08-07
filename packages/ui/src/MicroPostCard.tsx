"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config"
import { Pin } from "lucide-react"
import type { FeedPostDTO } from "@qoe/db/types"

export type { FeedPostDTO as MicroPostData }

export function MicroPostCard({
  post,
  currentUserId,
  isPreview,
  onOpenProfile,
  onOpenPost,
}: {
  post: FeedPostDTO
  currentUserId?: string | null
  isPreview?: boolean
  onOpenProfile?: (username: string) => void
  onOpenPost?: (postId: string) => void
}) {
  const [isRevealed, setIsRevealed] = React.useState<boolean>(false)
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left - width / 2
    const mouseY = e.clientY - rect.top - height / 2

    const rX = -(mouseY / (height / 2)) * 0.8
    const rY = (mouseX / (width / 2)) * 0.8

    setTilt({ x: rX, y: rY })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
  }

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = post.author.username || post.author.subdomain
    if (!targetUsername) return
    if (onOpenProfile) {
      onOpenProfile(targetUsername)
    } else {
      window.location.href = routes.feed.profile(targetUsername)
    }
  }

  const handleOpenPost = () => {
    if (onOpenPost) {
      onOpenPost(post.id)
    }
  }

  const hasWarning = !!post.triggerWarning && !isRevealed

  return (
    <motion.div
      animate={{
        rotateX: tilt.x,
        rotateY: tilt.y,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: 1000,
        transformStyle: "preserve-3d"
      }}
      className="py-4 border-b border-border/50 flex flex-col gap-5 hover:scale-[1.001] transition-all duration-500 ease-[0.16,1,0.3,1]"
    >
      {post.isPinned && (
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#EE4B2B] uppercase tracking-wider pl-1">
          <Pin className="w-3 h-3 fill-current rotate-45" />
          <span>Épinglé</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
        >
          <div className="w-9 h-9 rounded-sm overflow-hidden border border-border shrink-0 transition-transform duration-500 group-hover/author:scale-105">
            {post.author.logoUrl ? (
              <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                {post.author.name?.charAt(0) || "U"}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-foreground block leading-none group-hover/author:text-[#EE4B2B] transition-colors">
                {post.author.name}
              </span>
              {post.author.isCertified && <span className="text-[#EE4B2B] text-[10px] font-black">✓</span>}
            </div>
            <span className="text-[10px] text-muted-foreground block mt-1 uppercase tracking-wider font-sans">
              @{post.author.username || post.author.subdomain}
            </span>
          </div>
        </button>

        <span className="text-[10px] text-muted-foreground font-medium">
          {new Date(post.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
        </span>
      </div>

      <div className="relative">
        <div className={cn(
          "transition-all duration-300",
          hasWarning && "blur-[16px] pointer-events-none select-none"
        )}>
          <div 
            onClick={handleOpenPost}
            className="text-[15px] sm:text-[16px] text-foreground leading-relaxed font-sans cursor-pointer hover:text-primary transition-colors duration-200 pt-1"
          >
            {post.content}
          </div>

          {post.imageUrl && (
            <div className="overflow-hidden cursor-pointer mt-3" onClick={handleOpenPost}>
              <img
                src={post.imageUrl}
                alt=""
                className="w-full max-h-96 object-cover rounded-xl border border-border/50"
              />
            </div>
          )}
        </div>

        {hasWarning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-md transition-all duration-300 p-4 rounded-xl">
            <span className="text-[11px] uppercase tracking-wider text-amber-500 mb-2 font-bold">Avertissement</span>
            <p className="text-[13px] font-medium text-foreground text-center max-w-[280px] mb-3.5 leading-snug">
              {post.triggerWarning}
            </p>
            <button
              onClick={() => setIsRevealed(true)}
              className="px-3.5 py-2 bg-primary text-primary-foreground hover:opacity-90 text-[10px] font-bold rounded-xl transition-all cursor-pointer shadow-xs uppercase tracking-wider"
            >
              Afficher
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
