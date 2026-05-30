"use client"

import React from "react"
import { useTabStore } from "@/lib/use-tab-store"
import { TextParser } from "@/components/ui/TextParser"
import { cn } from "@/lib/utils"
import { MoreHorizontal, Pin } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { LinkPreview } from "@/components/social/LinkPreview"

export interface MicroPostData {
  id: string
  content: string
  imageUrl?: string | null
  createdAt: string | Date
  triggerWarning?: string | null
  isPinned?: boolean
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

export function MicroPostCard({ post }: { post: MicroPostData }) {
  const { addTab } = useTabStore()
  const [isRevealed, setIsRevealed] = React.useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [showPopover, setShowPopover] = React.useState<boolean>(false)

  React.useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id)
      }
    })
  }, [])

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowPopover(false)
    try {
      const { pinPost, unpinPost } = await import("@/app/(main)/home/actions")
      if (post.isPinned) {
        const res = await unpinPost(post.id)
        if (res.success) {
          toast.success("Post désépinglé du profil.")
          window.location.reload()
        }
      } else {
        const res = await pinPost(post.id)
        if (res.success) {
          toast.success("Post épinglé sur le profil.")
          window.location.reload()
        }
      }
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de la modification de l'état épinglé.")
    }
  }

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = post.author.username || post.author.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      username: targetUsername
    })
  }

  const handleOpenPost = () => {
    addTab({
      id: `post-${post.id}`,
      title: `${post.author.name || "Post"}`,
      type: "post"
    })
  }

  const hasWarning = !!post.triggerWarning && !isRevealed

  return (
    <div className="py-4 border-b border-neutral-100/70 flex flex-col gap-5 hover:scale-[1.001] transition-all duration-500 ease-[0.16,1,0.3,1]">
      {post.isPinned && (
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-[var(--qoe-vermillion)] uppercase tracking-wider pl-1">
          <Pin className="w-3 h-3 fill-current rotate-45" />
          <span>Lien Maison (Épinglé)</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button 
          onClick={handleOpenProfile}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left"
        >
          <div className="w-9 h-9 rounded-[10px] overflow-hidden border-[0.5px] border-neutral-200/50 shrink-0 transition-transform duration-500 group-hover/author:scale-105">
            {post.author.logoUrl ? (
              <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                {post.author.name?.charAt(0) || "U"}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-neutral-900 block leading-none group-hover/author:text-[#EE4B2B] transition-colors">{post.author.name}</span>
              {post.author.isCertified && <span className="text-[#EE4B2B] text-[10px] font-black">✓</span>}
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1 uppercase tracking-wider">@{post.author.username || post.author.subdomain}</span>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 font-medium">
            {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          
          {currentUserId === post.author.id && (
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
            <TextParser content={post.content} />
          </div>

          {getUrls(post.content).length > 0 && (
            <div className="mt-2">
              <LinkPreview urls={getUrls(post.content)} />
            </div>
          )}

          {post.imageUrl && (
            <div className="overflow-hidden cursor-pointer mt-1" onClick={handleOpenPost}>
              <ImageGrid urls={getImages(post.imageUrl)} />
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
    </div>
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
      "grid gap-2 overflow-hidden rounded-[var(--radius-element)]",
      urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
    )}>
      {urls.map((url) => (
        <div
          key={url}
          className="relative overflow-hidden bg-[var(--surface-2)] aspect-video border border-[var(--border-default)]"
        >
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover hover:scale-[1.01] transition-transform duration-500"
          />
        </div>
      ))}
    </div>
  )
}
