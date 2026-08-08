"use client"

import React from "react"
import { motion } from "framer-motion"

import { TextParser } from "@/components/ui/TextParser"
import { cn } from "@qoe/utils"
import { MoreHorizontal, Pin, CornerDownRight, Repeat } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { LinkPreview } from "./LinkPreview"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { routes } from "@qoe/config/routes"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"

export interface MicroPostData {
  id: string
  content: string
  imageUrl?: string | null
  createdAt: string | Date
  triggerWarning?: string | null
  isPinned?: boolean
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

export function MicroPostCard({ post, currentUserId: propUserId, onOpenProfile, onOpenPost }: { post: MicroPostData; currentUserId?: string | null; onOpenProfile?: (username: string) => void; onOpenPost?: (postId: string, authorUsername?: string) => void }) {
  const [isRevealed, setIsRevealed] = React.useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(propUserId || null)
  const [showPopover, setShowPopover] = React.useState<boolean>(false)
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

  React.useEffect(() => {
    if (propUserId) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id)
      }
    })
  }, [propUserId])

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowPopover(false)
    try {
      const { pinPost, unpinPost } = await import("@/app/(reader)/home/actions")
      if (post.isPinned) {
        const res = await unpinPost(post.id)
        if (res.ok) {
          toast.success("Post désépinglé du profil.")
          window.location.reload()
        }
      } else {
        const res = await pinPost(post.id)
        if (res.ok) {
          toast.success("Post épinglé sur le profil.")
          window.location.reload()
        }
      }
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de la modification de l'état épinglé.")
    }
  }

  const displayAuthor = post.repost ? post.repost.author : post.author
  const displayContent = post.repost ? post.repost.content : post.content
  const displayImageUrl = post.repost ? post.repost.imageUrl : post.imageUrl
  const displayPostId = post.repost ? post.repost.id : post.id
  const displayCreatedAt = post.repost?.createdAt || post.createdAt

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = displayAuthor.username || displayAuthor.subdomain
    if (!targetUsername) return
    if (onOpenProfile) {
      onOpenProfile(targetUsername)
    } else {
      window.location.href = routes.feed.profile(targetUsername)
    }
  }

  const handleOpenPost = () => {
    if (onOpenPost) {
      const username = displayAuthor.username || displayAuthor.subdomain || "user"
      onOpenPost(displayPostId, username)
    }
  }

  const handleOpenParentPost = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (post.parent && onOpenPost) {
      const parentUsername = post.parent.author.username || post.parent.author.subdomain || "user"
      onOpenPost(post.parent.id, parentUsername)
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
      className="py-4 border-b border-border/40 flex flex-col gap-3 hover:scale-[1.001] transition-all duration-500 ease-[0.16,1,0.3,1]"
    >
      {post.repost && (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const targetUsername = post.author.username || post.author.subdomain
            if (targetUsername) {
              if (onOpenProfile) onOpenProfile(targetUsername)
              else window.location.href = routes.feed.profile(targetUsername)
            }
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer pl-1 text-left outline-none"
        >
          <Repeat className="w-3.5 h-3.5 text-emerald-500" />
          <span><strong className="font-semibold text-foreground">@{post.author.username || post.author.subdomain}</strong> a repartagé</span>
        </button>
      )}

      {post.isPinned && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand pl-1">
          <Pin className="w-3 h-3 fill-current rotate-45" />
          <span>Épinglé</span>
        </div>
      )}

      {post.parent && (
        <button
          onClick={handleOpenParentPost}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer pl-1 text-left outline-none"
        >
          <CornerDownRight className="w-3.5 h-3.5 text-brand" />
          <span>En réponse à <strong className="font-semibold text-foreground">@{post.parent.author.username || post.parent.author.subdomain}</strong></span>
        </button>
      )}

      <div className="flex items-center justify-between">
        <HoverCard>
          <HoverCardTrigger
            render={
              <button 
                onClick={handleOpenProfile}
                className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
              >
                <AuthorAvatar user={displayAuthor} size="md" showBadge={false} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground block leading-none group-hover/author:text-brand transition-colors">{displayAuthor.name}</span>
                    {displayAuthor.isCertified && <span className="text-brand text-xs font-black">✓</span>}
                  </div>
                  <span className="text-xs text-muted-foreground block mt-1 font-sans">@{displayAuthor.username || displayAuthor.subdomain}</span>
                </div>
              </button>
            }
          />
          
          <HoverCardContent className="w-72 p-4 bg-white border border-neutral-200/50 rounded-lg shadow-xl z-50">
            <div className="flex justify-between space-x-4">
              <div className="w-10 h-10 rounded-sm overflow-hidden border border-neutral-200/30 shrink-0">
                {displayAuthor.logoUrl ? (
                  <img src={displayAuthor.logoUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-sm text-[var(--qoe-vermillion)]">
                    {displayAuthor.name?.charAt(0) || "U"}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-neutral-900 leading-none">{displayAuthor.name}</h4>
                  {displayAuthor.isCertified && <span className="text-[var(--qoe-vermillion)] text-[10px] font-black">✓</span>}
                </div>
                <p className="text-[10px] text-neutral-450 leading-none">@{displayAuthor.username || displayAuthor.subdomain}</p>
                <div className="flex items-center pt-2 gap-4 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                  <span className="text-[var(--qoe-vermillion)] font-sans">Auteur certifié</span>
                  <span className="font-sans">8.4k abonnés</span>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 font-medium">
            {new Date(displayCreatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          
          {currentUserId === displayAuthor.id && (
            <Popover open={showPopover} onOpenChange={setShowPopover}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="p-1 rounded-[var(--radius-button)] hover:bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer flex items-center justify-center outline-none"
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
              <PopoverContent align="end" className="w-44 p-1.5 space-y-0.5 bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-button)] shadow-lg z-50">
                <button
                  type="button"
                  onClick={handlePinToggle}
                  className="w-full text-left px-2.5 py-1.5 rounded-[var(--radius-button)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5 rotate-45" />
                  <span>{post.isPinned ? "Désépingler" : "Épingler"}</span>
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <div className="relative">
        <div className={cn(
          "transition-all duration-300",
          hasWarning && "blur-[16px] pointer-events-none select-none"
        )}>
          <div 
            onClick={handleOpenPost}
            className="text-[15px] sm:text-[16px] text-neutral-800 leading-relaxed font-sans cursor-pointer hover:text-neutral-950 transition-colors duration-200 pt-1"
          >
            <TextParser content={displayContent} />
          </div>

          {getUrls(displayContent).length > 0 && (
            <div className="mt-2">
              <LinkPreview 
                urls={getUrls(displayContent)} 
                onNavigate={(target) => {
                  if (target.type === "post" && onOpenPost) {
                    onOpenPost(target.id)
                  } else if (target.type === "article" && target.slug) {
                    const articleUrl = routes.tenant.article(displayAuthor.subdomain || "demo", target.slug)
                    window.open(articleUrl, "_blank")
                  }
                }}
              />
            </div>
          )}

          {displayImageUrl && (
            <div className="overflow-hidden cursor-pointer mt-1" onClick={handleOpenPost}>
              <ImageGrid urls={getImages(displayImageUrl)} />
            </div>
          )}
        </div>

        {hasWarning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-md transition-all duration-300 p-4">
            <span className="text-[11px] uppercase tracking-wider text-amber-600 mb-2 font-bold">Avertissement</span>
            <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100 text-center max-w-[280px] mb-3.5 leading-snug">
              {post.triggerWarning}
            </p>
            <button
              onClick={() => setIsRevealed(true)}
              className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-850 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-black hover:opacity-90 text-[10px] font-bold rounded-[var(--radius-button)] transition-all cursor-pointer shadow-sm uppercase tracking-wider"
            >
              Afficher
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return []
  if (url.startsWith("[")) {
    try {
      return JSON.parse(url)
    } catch (e) {
      return [url]
    }
  }
  return [url]
}

function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null

  return (
    <div className={cn(
      "grid gap-3 overflow-hidden rounded-md",
      urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
    )}>
      {urls.map((url) => (
        <div
          key={url}
          className="relative overflow-hidden bg-white p-0.5 border border-neutral-200/60 shadow-[0_1px_4px_rgba(0,0,0,0.02)] rounded-md group/img"
        >
          <div className="relative overflow-hidden aspect-video rounded-sm border border-neutral-100/50">
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
