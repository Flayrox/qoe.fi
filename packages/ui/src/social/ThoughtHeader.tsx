"use client"

import React from "react"
import { cn } from "@qoe/utils"
import { MoreHorizontal, Pin, Flag, EyeOff, Eye, Ban, Copy, Trash2 } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card"
import { ProfileHoverCard } from "./ProfileHoverCard"
import { AuthorAvatar } from "../ui/AuthorAvatar"
import { CertifiedBadge } from "../ui/CertifiedBadge"

export interface ThoughtAuthor {
  id: string
  name: string | null
  username: string | null
  subdomain?: string | null
  logoUrl?: string | null
  isCertified?: boolean
}

export interface ThoughtHeaderProps {
  author: ThoughtAuthor
  createdAt?: string | Date
  isPinned?: boolean
  isFocus?: boolean
  currentUserId?: string | null
  canHideReply?: boolean
  isHiddenByAuthor?: boolean
  isBlocked?: boolean
  postId?: string
  thoughtText?: string
  isFollowingAuthor?: boolean
  onFollowToggle?: (e: React.MouseEvent) => void
  onOpenProfile?: (username: string) => void
  onPinToggle?: (e: React.MouseEvent) => void
  onReportClick?: (e: React.MouseEvent) => void
  onHideReplyToggle?: (e: React.MouseEvent) => void
  onBlockUserToggle?: (e: React.MouseEvent) => void
  onDeleteClick?: (e: React.MouseEvent) => void
  className?: string
}

export function ThoughtHeader({
  author,
  createdAt,
  isPinned,
  isFocus = false,
  currentUserId,
  canHideReply,
  isHiddenByAuthor,
  isBlocked,
  postId,
  thoughtText,
  isFollowingAuthor = false,
  onFollowToggle,
  onOpenProfile,
  onPinToggle,
  onReportClick,
  onHideReplyToggle,
  onBlockUserToggle,
  onDeleteClick,
  className,
}: ThoughtHeaderProps) {
  const [showPopover, setShowPopover] = React.useState<boolean>(false)

  const authorHandle = author.username || author.subdomain || author.id?.slice(0, 8) || "auteur"

  const handleProfileClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenProfile) {
      onOpenProfile(authorHandle)
    }
  }

  return (
    <div className={cn("flex items-center justify-between font-sans select-none", className)}>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <ProfileHoverCard user={author} onOpenProfile={onOpenProfile}>
          <span
            className={cn(
              "font-semibold text-foreground hover:text-brand transition-colors cursor-pointer truncate",
              isFocus ? "text-sm sm:text-base" : "text-xs sm:text-sm"
            )}
          >
            {author.name || "Auteur"}
          </span>
        </ProfileHoverCard>

        {author.isCertified && <CertifiedBadge />}
        <ProfileHoverCard user={author} onOpenProfile={onOpenProfile}>
          <span className="text-xs text-muted-foreground hover:text-brand transition-colors cursor-pointer truncate">
            @{authorHandle}
          </span>
        </ProfileHoverCard>

        {!isFocus && createdAt && (
          <>
            <span className="text-xs text-muted-foreground opacity-60">·</span>
            <span className="text-xs text-muted-foreground font-normal">
              {new Date(createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Contextual Follow Button */}
        {isFocus && currentUserId && currentUserId !== author.id && onFollowToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFollowToggle(e)
            }}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shadow-sm hover:scale-[1.02]",
              isFollowingAuthor
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-brand text-brand-foreground hover:bg-brand/90"
            )}
          >
            {isFollowingAuthor ? "Abonné" : "Suivre"}
          </button>
        )}

        {/* Options Popover */}
        <Popover open={showPopover} onOpenChange={setShowPopover}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center outline-none"
                title="Options"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowPopover(true)
                }}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          />
          <PopoverContent align="end" className="w-48 p-1.5 space-y-0.5 bg-popover border border-border/40 rounded-xl shadow-lg z-50 font-sans">
            {thoughtText && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopover(false)
                  navigator.clipboard.writeText(thoughtText)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copier le texte</span>
              </button>
            )}

            {postId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopover(false)
                  const url = `${window.location.origin}/thought/${postId}`
                  navigator.clipboard.writeText(url)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copier le lien</span>
              </button>
            )}

            {currentUserId === author.id && onPinToggle && (
              <button
                type="button"
                onClick={(e) => {
                  setShowPopover(false)
                  onPinToggle(e)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Pin className="w-3.5 h-3.5 rotate-45" />
                <span>{isPinned ? "Désépingler" : "Épingler"}</span>
              </button>
            )}

            {canHideReply && onHideReplyToggle && (
              <button
                type="button"
                onClick={(e) => {
                  setShowPopover(false)
                  onHideReplyToggle(e)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                {isHiddenByAuthor ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{isHiddenByAuthor ? "Afficher cette réponse" : "Masquer cette réponse"}</span>
              </button>
            )}

            {currentUserId === author.id && onDeleteClick && (
              <button
                type="button"
                onClick={(e) => {
                  setShowPopover(false)
                  onDeleteClick(e)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            )}

            {currentUserId !== author.id && onBlockUserToggle && (
              <button
                type="button"
                onClick={(e) => {
                  setShowPopover(false)
                  onBlockUserToggle(e)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{isBlocked ? "Débloquer" : "Bloquer"} @{authorHandle}</span>
              </button>
            )}

            {onReportClick && (
              <button
                type="button"
                onClick={(e) => {
                  setShowPopover(false)
                  onReportClick(e)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Signaler</span>
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
