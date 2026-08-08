"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Heart, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"
import { TextParser } from "@/components/ui/TextParser"
import { QuotedThoughtCard } from "@/components/social/QuotedThoughtCard"
import { ThoughtThreadComposer } from "./ThoughtThreadComposer"
import { ThoughtThreadTombstone } from "./ThoughtThreadTombstone"
import { useThoughtThreadContext, type OptimisticThought } from "./ThoughtThreadContext"
import { cn } from "@qoe/ui/lib/utils"

export interface ThoughtThreadItemProps {
  reply: OptimisticThought
  depth?: number
}

export function ThoughtThreadItem({ reply, depth = 0 }: ThoughtThreadItemProps) {
  const {
    currentUserId,
    toggleLike,
    deleteThought,
    onOpenPost,
    onOpenProfile,
  } = useThoughtThreadContext()

  const [showReplyForm, setShowReplyForm] = useState(false)

  if (reply.isDeleted) {
    return (
      <div className={cn("space-y-1", depth > 0 && "pl-4 border-l border-border/30 mt-2")}>
        <ThoughtThreadTombstone />
        {reply.replies && reply.replies.length > 0 && (
          <div className="space-y-2 mt-1">
            {reply.replies.map((child) => (
              <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const author = reply.author
  const authorHandle = author.username || author.subdomain || author.id.slice(0, 8)
  const isAuthor = currentUserId === author.id

  const formattedDate = reply.createdAt
    ? new Date(reply.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })
    : ""

  return (
    <div className={cn("py-3 font-sans transition-all", depth > 0 && "pl-4 border-l border-border/30 mt-2")}>
      <div className="flex gap-3">
        <div onClick={() => onOpenProfile && onOpenProfile(authorHandle)} className="cursor-pointer shrink-0">
          <AuthorAvatar user={author} size="sm" showBadge={false} />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span
                onClick={() => onOpenProfile && onOpenProfile(authorHandle)}
                className="text-xs font-bold text-foreground hover:text-brand transition-colors cursor-pointer truncate"
              >
                {author.name}
              </span>
              {author.isCertified && <CertifiedBadge />}
              <span className="text-xs text-muted-foreground truncate">@{authorHandle}</span>
              {formattedDate && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                </>
              )}
            </div>

            {isAuthor && (
              <button
                onClick={() => deleteThought(reply.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors outline-none cursor-pointer"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="text-xs text-foreground/90 leading-relaxed">
            <TextParser content={reply.content} />
          </div>

          {/* Quote if embedded */}
          {reply.repost && (
            <QuotedThoughtCard post={reply.repost} onOpenPost={onOpenPost} />
          )}

          {/* Image */}
          {reply.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border/30 max-h-48">
              <img src={reply.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
            <button
              onClick={() => toggleLike(reply.id)}
              className={cn(
                "flex items-center gap-1 hover:text-brand transition-colors cursor-pointer outline-none",
                reply.liked && "text-brand font-semibold"
              )}
            >
              <motion.div whileTap={{ scale: 1.2 }}>
                <Heart className="w-3.5 h-3.5" fill={reply.liked ? "var(--accent-brand, #EE4B2B)" : "none"} />
              </motion.div>
              <span>{reply.likesCount || 0}</span>
            </button>

            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer outline-none"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Répondre</span>
            </button>
          </div>

          {/* Inline Composer if toggled */}
          {showReplyForm && (
            <div className="mt-2">
              <ThoughtThreadComposer parentId={reply.id} placeholder={`Répondre à @${authorHandle}...`} />
            </div>
          )}

          {/* Nested Replies */}
          {reply.replies && reply.replies.length > 0 && (
            <div className="space-y-1 mt-2">
              {reply.replies.map((child) => (
                <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
