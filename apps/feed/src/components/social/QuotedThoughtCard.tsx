"use client"

import React from "react"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { TextParser } from "@/components/ui/TextParser"
import { routes } from "@qoe/config/routes"
import { AlertCircle } from "lucide-react"

interface QuotedPostData {
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
}

interface QuotedThoughtCardProps {
  post: QuotedPostData | null
  onOpenPost?: (postId: string, authorUsername?: string) => void
}

export function QuotedThoughtCard({ post, onOpenPost }: QuotedThoughtCardProps) {
  if (!post) {
    return (
      <div className="mt-2.5 border border-border/40 bg-muted/20 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-muted-foreground italic">
        <AlertCircle className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <span>Cette pensée n'est plus disponible ou a été supprimée par son auteur.</span>
      </div>
    )
  }

  const handleAuthor = post.author.username || post.author.subdomain || post.author.id

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenPost) {
      onOpenPost(post.id, handleAuthor)
    } else {
      window.location.href = routes.feed.thought(handleAuthor, post.id)
    }
  }

  const formattedDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric"
  }) : ""

  return (
    <div
      onClick={handleClick}
      className="mt-2.5 border border-border/50 bg-card/60 hover:bg-muted/30 rounded-xl p-3.5 transition-all duration-200 cursor-pointer space-y-2 group/quote font-sans"
    >
      {/* Header: Micro Avatar, Name, Handle, Date */}
      <div className="flex items-center gap-2">
        <AuthorAvatar user={post.author} size="sm" showBadge={false} />
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs font-bold text-foreground truncate group-hover/quote:text-brand transition-colors">
            {post.author.name}
          </span>
          {post.author.isCertified && (
            <span className="text-brand text-[11px] font-black shrink-0">✓</span>
          )}
          <span className="text-xs text-muted-foreground truncate">
            @{handleAuthor}
          </span>
          {formattedDate && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{formattedDate}</span>
            </>
          )}
        </div>
      </div>

      {/* Quoted Body Text */}
      {post.content && (
        <div className="text-xs text-foreground/90 leading-relaxed font-sans line-clamp-3">
          <TextParser content={post.content} />
        </div>
      )}

      {/* Quoted Image Thumbnail */}
      {post.imageUrl && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border/30 max-h-48">
          <img
            src={post.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover/quote:scale-[1.01] transition-transform duration-300"
          />
        </div>
      )}
    </div>
  )
}
