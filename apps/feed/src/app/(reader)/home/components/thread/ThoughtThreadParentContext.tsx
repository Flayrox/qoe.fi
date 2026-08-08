"use client"

import React from "react"
import { CornerDownRight } from "lucide-react"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export function ThoughtThreadParentContext() {
  const { post, onOpenPost } = useThoughtThreadContext()

  if (!post || !post.parent) return null

  const parent = post.parent
  const parentAuthor = parent.author
  const authorHandle = parentAuthor.username || parentAuthor.subdomain || parentAuthor.id.slice(0, 8)

  const handleParentClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenPost) {
      onOpenPost(parent.id, authorHandle)
    }
  }

  const formattedDate = parent.createdAt
    ? new Date(parent.createdAt).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })
    : ""

  return (
    <div className="pb-3 border-b border-border/40 pl-3 border-l-2 border-border/50 font-sans my-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <CornerDownRight className="w-3 h-3 text-brand" />
        <span>En réponse à</span>
      </div>

      <div onClick={handleParentClick} className="cursor-pointer group/parent space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md overflow-hidden bg-muted shrink-0">
              {parentAuthor.logoUrl ? (
                <img src={parentAuthor.logoUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-xs text-brand">
                  {parentAuthor.name?.charAt(0) || "U"}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-foreground group-hover/parent:text-brand transition-colors">
                  {parentAuthor.name}
                </span>
                {parentAuthor.isCertified && <CertifiedBadge />}
              </div>
              <span className="text-xs text-muted-foreground">@{authorHandle}</span>
            </div>
          </div>
          {formattedDate && <span className="text-xs text-muted-foreground">{formattedDate}</span>}
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed font-sans line-clamp-2">{parent.content}</p>
      </div>
    </div>
  )
}
