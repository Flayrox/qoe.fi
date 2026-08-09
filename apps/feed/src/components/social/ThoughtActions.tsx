"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Heart, MessageSquare, Repeat, Share2, Quote } from "lucide-react"
import { cn } from "@qoe/utils"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { ThoughtData } from "./ThoughtCard"

export interface ThoughtActionsProps {
  post: ThoughtData
  variant?: "sm" | "md" | "lg"
  onLike?: (e: React.MouseEvent) => void
  onReply?: (e: React.MouseEvent) => void
  onRepost?: (e: React.MouseEvent) => void
  onQuote?: (e: React.MouseEvent) => void
  onShare?: (e: React.MouseEvent) => void
  className?: string
}

export function ThoughtActions({
  post,
  variant = "md",
  onLike,
  onReply,
  onRepost,
  onQuote,
  onShare,
  className,
}: ThoughtActionsProps) {
  const [popoverOpen, setPopoverContentOpen] = useState(false)

  const authorHandle =
    post.author?.username ||
    post.author?.subdomain ||
    post.author?.id?.slice(0, 8) ||
    "auteur"

  // Local optimistic fallbacks
  const liked = post.liked || false
  const likesCount = post.likesCount ?? post._count?.likes ?? 0
  const reposted = post.reposted || false
  const repostsCount = post.repostsCount ?? post._count?.reposts ?? 0
  const repliesCount = post.repliesCount ?? post._count?.replies ?? 0

  const handleShareClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onShare) {
      onShare(e)
      return
    }

    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/thought/${authorHandle}/${post.id}`
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(shareUrl)
        toast.success("Lien copié dans le presse-papier !")
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = shareUrl
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
        toast.success("Lien copié dans le presse-papier !")
      }
    } catch {
      toast.error("Impossible de copier le lien.")
    }
  }

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  }

  const textSizes = {
    sm: "text-xs",
    md: "text-xs sm:text-sm",
    lg: "text-sm sm:text-base font-medium",
  }

  const gapSizes = {
    sm: "gap-4 sm:gap-6",
    md: "gap-6 sm:gap-8",
    lg: "gap-8 sm:gap-12",
  }

  const iconClass = iconSizes[variant]
  const textClass = textSizes[variant]

  return (
    <div
      className={cn(
        "flex items-center text-muted-foreground pt-1 select-none font-sans",
        gapSizes[variant],
        className
      )}
    >
      {/* 1. LIKE BUTTON */}
      <button
        onClick={onLike}
        className={cn(
          "flex items-center gap-1.5 transition-colors cursor-pointer outline-none group/like",
          liked ? "text-brand font-semibold" : "hover:text-brand"
        )}
        title={liked ? "Je n'aime plus" : "J'aime"}
        aria-label="J'aime"
      >
        <motion.div whileTap={{ scale: 1.3 }} transition={{ duration: 0.15 }}>
          <Heart
            className={cn(iconClass, "transition-transform group-hover/like:scale-110")}
            fill={liked ? "var(--color-brand, #EE4B2B)" : "none"}
            stroke={liked ? "var(--color-brand, #EE4B2B)" : "currentColor"}
          />
        </motion.div>
        <span className={textClass}>{likesCount}</span>
      </button>

      {/* 2. REPLY BUTTON */}
      <button
        onClick={onReply}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer outline-none group/reply"
        title="Répondre"
        aria-label="Répondre"
      >
        <MessageSquare className={cn(iconClass, "transition-transform group-hover/reply:scale-110")} />
        <span className={textClass}>{repliesCount}</span>
      </button>

      {/* 3. REPOST BUTTON & POPOVER */}
      <Popover open={popoverOpen} onOpenChange={setPopoverContentOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
              }}
              className={cn(
                "flex items-center gap-1.5 transition-colors cursor-pointer outline-none group/repost",
                reposted ? "text-emerald-500 font-semibold" : "hover:text-emerald-500"
              )}
              title="Repartager ou citer"
              aria-label="Repartager"
            >
              <motion.div whileTap={{ scale: 1.25 }} transition={{ duration: 0.15 }}>
                <Repeat className={cn(iconClass, "transition-transform group-hover/repost:scale-110")} />
              </motion.div>
              <span className={textClass}>{repostsCount}</span>
            </button>
          }
        />
        <PopoverContent
          align="start"
          className="w-48 p-1.5 bg-zinc-950/90 backdrop-blur-2xl border border-white/[0.08] shadow-2xl rounded-xl font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPopoverContentOpen(false)
              if (onRepost) onRepost(e)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
          >
            <Repeat className="w-3.5 h-3.5 text-emerald-500" />
            <span>{reposted ? "Annuler le repartage" : "Repartager"}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              setPopoverContentOpen(false)
              if (onQuote) onQuote(e)
              else if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("open-composer", {
                    detail: { quoteThought: post, mode: "thought" },
                  })
                )
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
          >
            <Quote className="w-3.5 h-3.5 text-brand" />
            <span>Citer la pensée</span>
          </button>
        </PopoverContent>
      </Popover>

      {/* 4. SHARE BUTTON */}
      <button
        onClick={handleShareClick}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer outline-none group/share ml-auto sm:ml-0"
        title="Partager"
        aria-label="Partager"
      >
        <Share2 className={cn(iconClass, "transition-transform group-hover/share:scale-110")} />
      </button>
    </div>
  )
}
