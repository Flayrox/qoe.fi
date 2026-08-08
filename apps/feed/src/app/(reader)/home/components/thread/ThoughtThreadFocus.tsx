"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Pin, MoreHorizontal, Repeat, Quote, Heart, MessageSquare, Share2, Flag, Trash2 } from "lucide-react"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"
import { TextParser } from "@/components/ui/TextParser"
import { LinkPreview, getUrls } from "@/components/social/LinkPreview"
import { QuotedThoughtCard } from "@/components/social/QuotedThoughtCard"
import { ModerationReportModal } from "@/components/social/ModerationReportModal"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/Popover"
import { useThoughtThreadContext } from "./ThoughtThreadContext"
import { routes } from "@qoe/config/routes"
import { cn } from "@qoe/ui/lib/utils"

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
  } = useThoughtThreadContext()

  const [showOptionsPopover, setShowOptionsPopover] = useState(false)
  const [showRepostPopover, setShowRepostPopover] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [isWarningRevealed, setIsWarningRevealed] = useState(false)

  if (!post) return null

  if (post.isDeleted) {
    return (
      <div className="p-6 bg-muted/20 border border-border/40 rounded-xl text-center text-sm text-muted-foreground italic my-4">
        Cette pensée a été supprimée par son auteur.
      </div>
    )
  }

  const author = post.author
  const authorHandle = author.username || author.subdomain || author.id.slice(0, 8)
  const isAuthor = currentUserId === author.id
  const isQuotePost = Boolean(post.repost)
  const hasWarning = Boolean(post.triggerWarning && !isWarningRevealed)

  const formattedDate = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  const handleLike = () => toggleLike(post.id)
  const handleRepost = () => {
    setShowRepostPopover(false)
    repostThought(post.id)
  }

  const handleShare = () => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    if (navigator.share) {
      navigator.share({ title: `Pensée de ${author.name}`, url })
    } else {
      navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="py-5 border-b border-border/40 font-sans space-y-4">
      {/* Header: Avatar, Name, Handle, Menu */}
      <div className="flex items-center justify-between">
        <div
          onClick={() => onOpenProfile && onOpenProfile(authorHandle)}
          className="flex items-center gap-3 cursor-pointer group/author"
        >
          <AuthorAvatar user={author} size="md" showBadge={false} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-foreground group-hover/author:text-brand transition-colors">
                {author.name}
              </span>
              {author.isCertified && <CertifiedBadge />}
            </div>
            <span className="text-xs text-muted-foreground block">@{authorHandle}</span>
          </div>
        </div>

        <Popover open={showOptionsPopover} onOpenChange={setShowOptionsPopover}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
          />
          <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5 bg-card border border-border/40 rounded-xl shadow-xl z-50">
            {isAuthor && (
              <button
                type="button"
                onClick={() => {
                  setShowOptionsPopover(false)
                  deleteThought(post.id)
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowOptionsPopover(false)
                setShowReportModal(true)
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Signaler</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Main Focus Body */}
      <div className="relative">
        <div className={cn("transition-all duration-300", hasWarning && "blur-lg pointer-events-none select-none")}>
          <div className="text-[16px] sm:text-[18px] text-foreground font-sans leading-relaxed pt-1">
            <TextParser content={post.content} />
          </div>

          {/* Embedded Quote Thought */}
          {isQuotePost && (
            <div className="mt-3">
              <QuotedThoughtCard post={post.repost || null} onOpenPost={onOpenPost} />
            </div>
          )}

          {/* Link Previews */}
          {getUrls(post.content).length > 0 && (
            <div className="mt-3">
              <LinkPreview
                urls={getUrls(post.content)}
                onNavigate={(target) => {
                  if (target.type === "post" && onOpenPost) {
                    onOpenPost(target.id)
                  } else if (target.type === "article" && target.slug) {
                    window.open(routes.tenant.article(author.subdomain || "demo", target.slug), "_blank")
                  }
                }}
              />
            </div>
          )}

          {/* Image */}
          {post.imageUrl && (
            <div
              className="mt-3 rounded-xl overflow-hidden border border-border/40 cursor-pointer bg-muted/30"
              onClick={() => setLightboxImage(post.imageUrl!)}
            >
              <img src={post.imageUrl} alt="" className="w-full max-h-96 object-cover hover:scale-[1.01] transition-transform duration-300" />
            </div>
          )}
        </div>

        {hasWarning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/80 backdrop-blur-md p-4 rounded-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-2">Avertissement</span>
            <p className="text-xs font-medium text-foreground text-center mb-3">{post.triggerWarning}</p>
            <button
              onClick={() => setIsWarningRevealed(true)}
              className="px-3.5 py-1.5 bg-foreground text-background font-bold text-xs rounded-lg uppercase tracking-wider cursor-pointer"
            >
              Afficher
            </button>
          </div>
        )}
      </div>

      {/* Timestamp */}
      {formattedDate && (
        <div className="text-xs text-muted-foreground pt-1 border-b border-border/20 pb-3">
          {formattedDate}
        </div>
      )}

      {/* Social Actions Bar */}
      <div className="flex items-center justify-around py-1 text-sm text-muted-foreground">
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-2 hover:text-brand transition-colors cursor-pointer outline-none",
            post.liked && "text-brand font-semibold"
          )}
        >
          <motion.div whileTap={{ scale: 1.25 }}>
            <Heart className="w-4 h-4" fill={post.liked ? "var(--accent-brand, #EE4B2B)" : "none"} />
          </motion.div>
          <span>{post.likesCount || 0}</span>
        </button>

        <button className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer outline-none">
          <MessageSquare className="w-4 h-4" />
          <span>{post.repliesCount || 0}</span>
        </button>

        <Popover open={showRepostPopover} onOpenChange={setShowRepostPopover}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 hover:text-emerald-500 transition-colors cursor-pointer outline-none"
              >
                <Repeat className="w-4 h-4" />
                <span>Repost</span>
              </button>
            }
          />
          <PopoverContent align="center" className="w-44 p-1.5 bg-card border border-border/40 rounded-xl shadow-xl z-50">
            <button
              type="button"
              onClick={handleRepost}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Repeat className="w-3.5 h-3.5 text-emerald-500" />
              <span>Partager direct</span>
            </button>
          </PopoverContent>
        </Popover>

        <button
          onClick={handleShare}
          className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer outline-none"
        >
          <Share2 className="w-4 h-4" />
          <span>Partager</span>
        </button>
      </div>

      <ModerationReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={post.id}
        targetType="thought"
      />
    </div>
  )
}
