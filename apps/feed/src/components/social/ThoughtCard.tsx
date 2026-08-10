"use client"

import React from "react"
import { TextParser } from "@qoe/ui/ui/TextParser"
import { cn } from "@qoe/utils"
import { MoreHorizontal, Pin, CornerDownRight, Repeat, Flag } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@qoe/ui/ui/popover"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { LinkPreview } from "./LinkPreview"
import { QuotedThoughtCard } from "./QuotedThoughtCard"
import { ModerationReportModal } from "./ModerationReportModal"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@qoe/ui/ui/hover-card"
import { routes } from "@qoe/config/routes"
import { AuthorAvatar } from "@qoe/ui/ui/AuthorAvatar"
import { CertifiedBadge } from "@qoe/ui/ui/CertifiedBadge"
import { 
  pinPostAction as pinPost, 
  unpinPostAction as unpinPost, 
  toggleLikePostAction as toggleLikePost, 
  toggleRepostPostAction as toggleRepostPost 
} from "@qoe/api-client/actions/feed"

import { ThoughtActions } from "./ThoughtActions"

export type ThoughtVariant = "timeline" | "focus" | "parent" | "reply"

export interface ThoughtData {
  id: string
  content: string
  imageUrl?: string | null
  createdAt: string | Date
  triggerWarning?: string | null
  isPinned?: boolean
  isDeleted?: boolean
  likesCount?: number
  repliesCount?: number
  repostsCount?: number
  liked?: boolean
  reposted?: boolean
  _count?: {
    likes?: number
    replies?: number
    reposts?: number
  }
  parent?: {
    id: string
    author: {
      id: string
      name: string | null
      username: string | null
      subdomain?: string | null
    }
  } | null
  repost?: {
    id: string
    content: string
    imageUrl?: string | null
    createdAt?: string | Date
    author: {
      id: string
      name: string | null
      username: string | null
      subdomain?: string | null
      logoUrl: string | null
      isCertified?: boolean
    }
  } | null
  author: {
    id: string
    name: string | null
    username: string | null
    subdomain?: string | null
    logoUrl: string | null
    isCertified?: boolean
  }
}

const getUrls = (text: string): string[] => {
  const urlRegex = /https?:\/\/[^\s]+/gi
  return text.match(urlRegex) || []
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return []
  if (url.startsWith("[")) {
    try {
      return JSON.parse(url)
    } catch {
      return [url]
    }
  }
  return [url]
}

export interface ThoughtCardProps {
  post: ThoughtData
  variant?: ThoughtVariant
  depth?: number
  currentUserId?: string | null
  onOpenProfile?: (username: string) => void
  onOpenPost?: (postId: string, authorUsername?: string) => void
  onLikeToggle?: (postId: string) => void
  onRepostToggle?: (postId: string) => void
  className?: string
}

export function ThoughtCard({
  post,
  variant = "timeline",
  depth = 0,
  currentUserId: propUserId,
  onOpenProfile,
  onOpenPost,
  onLikeToggle,
  onRepostToggle,
  className,
}: ThoughtCardProps) {
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(propUserId || null)
  const [showReportModal, setShowReportModal] = React.useState<boolean>(false)
  const [showPopover, setShowPopover] = React.useState<boolean>(false)

  React.useEffect(() => {
    if (propUserId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id)
      }
    })
  }, [propUserId])

  const isPureRepost = !!post.repost && !post.content?.trim()
  const isQuotePost = !!post.repost && !!post.content?.trim()

  const displayAuthor = isPureRepost ? post.repost!.author : post.author
  const displayContent = isPureRepost ? post.repost!.content : post.content
  const displayImageUrl = isPureRepost ? post.repost!.imageUrl : post.imageUrl
  const displayPostId = isPureRepost ? post.repost!.id : post.id
  const displayCreatedAt = isPureRepost ? (post.repost!.createdAt || post.createdAt) : post.createdAt

  const authorHandle = displayAuthor.username || displayAuthor.subdomain || displayAuthor.id?.slice(0, 8) || "auteur"

  const handleOpenPost = () => {
    if (variant === "focus") return
    if (onOpenPost) {
      onOpenPost(displayPostId, authorHandle)
    }
  }

  const handleProfileClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenProfile) {
      onOpenProfile(authorHandle)
    } else {
      window.location.href = routes.feed.profile(authorHandle)
    }
  }

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowPopover(false)
    try {
      if (post.isPinned) {
        const res = await unpinPost(post.id)
        if (res.ok) toast.success("Pensée désépinglée du profil.")
      } else {
        const res = await pinPost(post.id)
        if (res.ok) toast.success("Pensée épinglée sur le profil.")
      }
    } catch {
      toast.error("Erreur lors de la modification de l'état épinglé.")
    }
  }

  const isFocus = variant === "focus"
  const isParent = variant === "parent"
  const isReply = variant === "reply"

  return (
    <article
      onClick={handleOpenPost}
      className={cn(
        "group relative flex gap-3 transition-colors font-sans select-none",
        !isFocus && "cursor-pointer hover:bg-white/[0.02]",
        variant === "timeline" && "py-4 border-b border-border/40",
        variant === "parent" && "pt-3 pb-1",
        variant === "focus" && "p-5 bg-card border border-border/40 rounded-xl my-2 shadow-sm",
        variant === "reply" && depth > 0 && "pl-4 border-l border-border/30 mt-2 py-2",
        variant === "reply" && depth === 0 && "py-3 border-b border-border/20",
        className
      )}
    >
      {/* COLUMN 1: Avatar & Thread Line Connectors for Parent Ancestors */}
      <div className="relative flex flex-col items-center shrink-0">
        <div onClick={handleProfileClick} className="relative z-10 cursor-pointer">
          <AuthorAvatar user={displayAuthor} size={isFocus ? "md" : "sm"} showBadge={false} />
        </div>

        {/* Thread connector line running down for parent ancestor cards */}
        {isParent && (
          <div className="w-[2px] bg-border/50 flex-1 my-1 rounded-full min-h-[24px]" />
        )}
      </div>

      {/* COLUMN 2: Main Content Area */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Pure Repost Banner */}
        {isPureRepost && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5">
            <Repeat className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              <strong className="font-semibold text-foreground">
                @{post.author.username || post.author.subdomain || post.author.id.slice(0, 8)}
              </strong>{" "}
              a repartagé
            </span>
          </div>
        )}

        {/* Pinned Badge */}
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand pb-0.5">
            <Pin className="w-3 h-3 fill-current rotate-45" />
            <span>Épinglé</span>
          </div>
        )}

        {/* Reply Context Banner */}
        {post.parent && !isParent && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5">
            <CornerDownRight className="w-3.5 h-3.5 text-brand" />
            <span>
              En réponse à{" "}
              <strong className="font-semibold text-foreground">
                @{post.parent.author.username || post.parent.author.subdomain || post.parent.author.id.slice(0, 8)}
              </strong>
            </span>
          </div>
        )}

        {/* Author Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <HoverCard>
              <HoverCardTrigger
                render={
                  <span
                    onClick={handleProfileClick}
                    className={cn(
                      "font-bold text-foreground hover:text-brand transition-colors cursor-pointer truncate",
                      isFocus ? "text-base" : "text-sm"
                    )}
                  >
                    {displayAuthor.name || "Auteur"}
                  </span>
                }
              />
              <HoverCardContent className="w-72 p-4 bg-card border border-border/40 rounded-xl shadow-xl z-50 font-sans">
                <div className="flex justify-between space-x-4">
                  <div className="w-10 h-10 rounded-md overflow-hidden border border-border/40 shrink-0">
                    {displayAuthor.logoUrl ? (
                      <img src={displayAuthor.logoUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-sm text-brand">
                        {displayAuthor.name?.charAt(0) || "U"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-foreground leading-none">{displayAuthor.name}</h4>
                      {displayAuthor.isCertified && <span className="text-brand text-[10px] font-black">✓</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-none">@{authorHandle}</p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            {displayAuthor.isCertified && <CertifiedBadge />}
            <span className="text-xs text-muted-foreground truncate">@{authorHandle}</span>

            {!isFocus && displayCreatedAt && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(displayCreatedAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })}
                </span>
              </>
            )}
          </div>

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
            <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5 bg-card border border-border/40 rounded-xl shadow-lg z-50">
              {currentUserId === displayAuthor.id && (
                <button
                  type="button"
                  onClick={handlePinToggle}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5 rotate-45" />
                  <span>{post.isPinned ? "Désépingler" : "Épingler"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowPopover(false)
                  setShowReportModal(true)
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-2 cursor-pointer font-medium"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Signaler</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Text Body Content */}
        <div
          className={cn(
            "text-foreground/90 leading-relaxed font-sans pt-0.5",
            isFocus ? "text-lg py-1" : "text-xs sm:text-sm"
          )}
        >
          <TextParser content={displayContent} />
        </div>

        {/* Embedded Quote Card if Quote Post */}
        {isQuotePost && (
          <QuotedThoughtCard post={post.repost || null} onOpenPost={handleOpenPost} />
        )}

        {/* Link Previews */}
        {getUrls(displayContent).length > 0 && (
          <div className="mt-2">
            <LinkPreview
              urls={getUrls(displayContent)}
              onNavigate={(target) => {
                if (target.type === "post") {
                  handleOpenPost()
                } else if (target.type === "article" && target.slug) {
                  const articleUrl = routes.tenant.article(displayAuthor.subdomain || "demo", target.slug)
                  window.open(articleUrl, "_blank")
                }
              }}
            />
          </div>
        )}

        {/* Image Grid */}
        {displayImageUrl && (
          <div className="overflow-hidden cursor-pointer mt-1" onClick={handleOpenPost}>
            <ImageGrid urls={getImages(displayImageUrl)} />
          </div>
        )}

        {/* Focus Mode Full Date & Time Header */}
        {isFocus && (
          <div className="py-2.5 my-1 border-y border-border/40 text-xs text-muted-foreground">
            {new Date(displayCreatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            {new Date(displayCreatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}

        {/* Centralized Action Bar */}
        <ThoughtActions
          post={post}
          variant={isFocus ? "lg" : isParent || isReply ? "sm" : "md"}
          onLike={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onLikeToggle) {
              onLikeToggle(displayPostId)
            } else {
              await toggleLikePost(displayPostId)
            }
          }}
          onReply={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.dispatchEvent(
              new CustomEvent("open-composer", {
                detail: { replyToThought: isPureRepost ? post.repost : post, mode: "thought" },
              })
            )
          }}
          onRepost={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onRepostToggle) {
              onRepostToggle(displayPostId)
            } else {
              await toggleRepostPost(displayPostId)
            }
          }}
          onQuote={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.dispatchEvent(
              new CustomEvent("open-composer", {
                detail: { quotedThought: isPureRepost ? post.repost : post, mode: "thought" },
              })
            )
          }}
        />

        <ModerationReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          targetId={displayPostId}
          targetType="thought"
        />
      </div>
    </article>
  )
}

function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null

  return (
    <div
      className={cn(
        "grid gap-3 overflow-hidden rounded-xl",
        urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {urls.map((url) => (
        <div
          key={url}
          className="relative overflow-hidden bg-card p-0.5 border border-border/40 shadow-xs rounded-xl group/img"
        >
          <div className="relative overflow-hidden aspect-video rounded-lg border border-border/30">
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover/img:scale-[1.02]"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
