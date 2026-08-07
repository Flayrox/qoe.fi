"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { MessageSquare, Repeat, Heart, Bookmark, Clock } from "lucide-react"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config"
import type { FeedArticleDTO, CreatorProfileDTO } from "@qoe/db/types"

export type { FeedArticleDTO as Article }

interface ArticleCardProps {
  article: FeedArticleDTO
  idx?: number
  dbUser?: any
  isBookmarked?: boolean
  isFollowed?: boolean
  handleFollowToggle?: (author: CreatorProfileDTO) => void
  handleBookmarkToggle?: (article: FeedArticleDTO) => void
  featured?: boolean
  isPreview?: boolean
  onOpenArticle?: (article: FeedArticleDTO) => void
  onOpenProfile?: (username: string) => void
  onOpenPost?: (postId: string) => void
}

export function ArticleCard({
  article,
  idx = 0,
  dbUser,
  isBookmarked = false,
  isFollowed = false,
  handleFollowToggle,
  handleBookmarkToggle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const [liked, setLiked] = useState(article.liked || false)
  const [likesCount, setLikesCount] = useState(article.likesCount || 0)
  const [reposted, setReposted] = useState(false)
  const [repostsCount, setRepostsCount] = useState(0)

  const isMicroPost = !article.title
  const url = isMicroPost
    ? "#"
    : article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug)

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = article.author.username || article.author.subdomain
    if (!targetUsername) return
    if (onOpenProfile) {
      onOpenProfile(targetUsername)
    } else {
      window.location.href = routes.feed.profile(targetUsername)
    }
  }

  const handleCardClick = () => {
    if (isMicroPost && onOpenPost) {
      onOpenPost(article.id)
    }
  }

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLiked((prev: boolean) => !prev)
    setLikesCount((prev: number) => (liked ? Math.max(0, prev - 1) : prev + 1))
  }

  const handleRepost = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReposted((prev: boolean) => !prev)
    setRepostsCount((prev: number) => (reposted ? Math.max(0, prev - 1) : prev + 1))
  }

  const formattedDate = new Date(article.createdAt).toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric"
  })

  const rawExcerpt = article.content ? article.content.replace(/<[^>]*>?/gm, "") : ""

  return (
    <article
      onClick={handleCardClick}
      className={cn(
        "group relative pt-5 pb-5 first:pt-2 font-sans select-none",
        "border-b border-border/40 last:border-b-0",
        isMicroPost ? "cursor-pointer" : ""
      )}
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        {/* Author Avatar */}
        <button
          onClick={handleOpenProfile}
          className="shrink-0 outline-none group/avatar cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-border/60 group-hover/avatar:ring-primary/50 transition-all duration-200">
            {article.author.logoUrl ? (
              <img
                src={article.author.logoUrl}
                alt={article.author.name || "Auteur"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center font-bold text-xs text-primary">
                {(article.author.name || "A").substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </button>

        {/* Content Body */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Header Metadata */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <button
                onClick={handleOpenProfile}
                className="font-semibold text-foreground hover:text-primary transition-colors truncate outline-none cursor-pointer"
              >
                {article.author.name || "Auteur"}
              </button>
              <span className="text-muted-foreground/70 truncate">
                @{article.author.username || article.author.subdomain || "qoe"}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70 shrink-0">
              {formattedDate}
            </span>
          </div>

          {/* Article Title (if long-form article) */}
          {article.title && (
            <a
              href={url}
              target={article.author.subdomain ? "_blank" : "_self"}
              rel="noreferrer"
              className="block group/title pt-0.5"
            >
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground group-hover/title:text-primary transition-colors leading-snug">
                {article.title}
              </h2>
            </a>
          )}

          {/* Excerpt Text */}
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed font-normal line-clamp-3">
            {rawExcerpt}
          </p>

          {/* Optional Hero Image Preview */}
          {article.imageUrl && (
            <div className="mt-2.5 rounded-xl overflow-hidden border border-border/40 max-h-64 bg-muted">
              <img
                src={article.imageUrl}
                alt=""
                className="w-full h-full object-cover max-h-64"
              />
            </div>
          )}

          {/* Footer Actions Row (Rauno / Apple Hybrid Style) */}
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground/80">
            <div className="flex items-center gap-5 sm:gap-6">
              {/* Comment / Thread */}
              <button
                onClick={() => onOpenPost && onOpenPost(article.id)}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors outline-none cursor-pointer"
                title="Commenter"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">{article.repliesCount || 0}</span>
              </button>

              {/* Repost */}
              <button
                onClick={handleRepost}
                className={cn(
                  "flex items-center gap-1.5 transition-colors outline-none cursor-pointer",
                  reposted ? "text-emerald-500" : "hover:text-emerald-500"
                )}
                title="Reposter"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">{repostsCount}</span>
              </button>

              {/* Like */}
              <button
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-1.5 transition-colors outline-none cursor-pointer",
                  liked ? "text-primary" : "hover:text-primary"
                )}
                title="Aimer"
              >
                <Heart className={cn("w-3.5 h-3.5", liked ? "fill-primary text-primary" : "")} />
                <span className="text-[11px] font-medium">{likesCount}</span>
              </button>
            </div>

            {/* Right: Reading time & Bookmark */}
            <div className="flex items-center gap-3">
              {article.readingTime > 0 && (
                <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3" />
                  {article.readingTime} min
                </span>
              )}

              {handleBookmarkToggle && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleBookmarkToggle(article)
                  }}
                  className={cn(
                    "p-1 hover:text-foreground transition-colors outline-none cursor-pointer",
                    isBookmarked ? "text-primary" : ""
                  )}
                  title={isBookmarked ? "Retirer des signets" : "Mettre en signet"}
                >
                  <Bookmark className={cn("w-3.5 h-3.5", isBookmarked ? "fill-primary text-primary" : "")} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
