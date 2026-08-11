"use client"

import React, { useState } from "react"
import { MessageSquare, Repeat, Heart, Bookmark } from "lucide-react"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config"
import type { FeedArticleDTO, CreatorProfileDTO } from "@qoe/db/types"
import { useRequireAuth } from "./auth/AuthModalContext"
import { useTranslate } from "@qoe/i18n"

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
  const { t } = useTranslate()
  const { withAuth } = useRequireAuth()
  const [liked, setLiked] = useState(article.liked || false)
  const [likesCount, setLikesCount] = useState(article.likesCount || 0)
  const [reposted, setReposted] = useState(false)
  const [repostsCount, setRepostsCount] = useState(0)

  const isThought = !article.title
  const url = isThought
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

  const handleCardClick = (e: React.MouseEvent) => {
    if (onOpenArticle) {
      onOpenArticle(article)
    } else if (isThought && onOpenPost) {
      onOpenPost(article.id)
    }
  }

  const handleTitleClick = (e: React.MouseEvent) => {
    if (onOpenArticle) {
      e.preventDefault()
      e.stopPropagation()
      onOpenArticle(article)
    } else if (onOpenPost) {
      e.preventDefault()
      e.stopPropagation()
      onOpenPost(article.id)
    }
  }

  const handleLike = withAuth((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLiked((prev: boolean) => !prev)
    setLikesCount((prev: number) => (liked ? Math.max(0, prev - 1) : prev + 1))
  }, { actionContext: "like" })

  const handleRepost = withAuth((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReposted((prev: boolean) => !prev)
    setRepostsCount((prev: number) => (reposted ? Math.max(0, prev - 1) : prev + 1))
  }, { actionContext: "repost" })

  const formattedDate = new Date(article.createdAt).toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric",
  })

  const rawExcerpt = article.content ? article.content.replace(/<[^>]*>?/gm, "") : ""

  return (
    <article
      onClick={handleCardClick}
      className={cn(
        "group relative pt-6 pb-6 first:pt-0 font-sans antialiased select-none",
        (isThought || onOpenArticle) ? "cursor-pointer" : ""
      )}
    >
      {/* Top subtle gradient divider line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border/30 to-transparent" />

      <div className="flex items-start gap-4">
        {/* Author Avatar */}
        <button
          type="button"
          onClick={handleOpenProfile}
          className="shrink-0 outline-none group/avatar cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-border/40 group-hover/avatar:ring-primary/50 transition-all">
            {article.author.logoUrl ? (
              <img
                src={article.author.logoUrl}
                alt={article.author.name || "Auteur"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center font-semibold text-xs text-primary">
                {(article.author.name || "A").substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </button>

        {/* Content Body */}
        <div className="flex-1 space-y-2 min-w-0">
          {/* Header Metadata */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 truncate">
              <button
                type="button"
                onClick={handleOpenProfile}
                className="font-medium text-foreground hover:text-primary transition-colors truncate outline-none cursor-pointer"
              >
                {article.author.name || "Auteur"}
              </button>
              <span className="text-muted-foreground truncate">
                @{article.author.username || article.author.subdomain || "qoe"}
              </span>
              {!isThought && (
                <span className="px-2 py-0.5 text-[10px] bg-primary/10 text-primary rounded-full border border-primary/20 font-medium">
                  {t("feed.article_badge", "Article")}
                </span>
              )}
            </div>
            <span className="text-muted-foreground shrink-0">{formattedDate}</span>
          </div>

          {/* Article Title (if long-form article) */}
          {article.title && (
            <a
              href={url}
              onClick={handleTitleClick}
              target={article.author.subdomain && !onOpenArticle ? "_blank" : "_self"}
              rel="noreferrer"
              className="block group/title pt-1 cursor-pointer"
            >
              <h2 className="text-lg font-medium text-foreground tracking-tight leading-snug group-hover/title:text-primary transition-colors">
                {article.title}
              </h2>
            </a>
          )}

          {/* Excerpt Text */}
          <p className="text-sm text-muted-foreground leading-relaxed font-normal line-clamp-3">
            {rawExcerpt}
          </p>

          {/* Optional Hero Image Preview */}
          {article.imageUrl && (
            <div className="mt-2.5 rounded-xl overflow-hidden border border-border/40 max-h-64 bg-muted/40">
              <img
                src={article.imageUrl}
                alt=""
                className="w-full h-full object-cover max-h-64"
              />
            </div>
          )}

          {/* Footer Actions Row (Exact Rauno Apple Geometry) */}
          <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-6">
              {/* Comment / Thread */}
              <button
                type="button"
                onClick={() => onOpenPost && onOpenPost(article.id)}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors outline-none cursor-pointer"
                title={t("feed.reply_btn", "Commenter")}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{article.repliesCount || 0}</span>
              </button>

              {/* Repost */}
              <button
                type="button"
                onClick={handleRepost}
                className={cn(
                  "flex items-center gap-1.5 transition-colors outline-none cursor-pointer",
                  reposted ? "text-emerald-400" : "hover:text-emerald-400"
                )}
                title={t("feed.repost_btn", "Reposter")}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>{repostsCount}</span>
              </button>

              {/* Like */}
              <button
                type="button"
                onClick={handleLike}
                className={cn(
                  "flex items-center gap-1.5 transition-colors outline-none cursor-pointer",
                  liked ? "text-primary" : "hover:text-primary"
                )}
                title={t("feed.like", "Aimer")}
              >
                <Heart className={cn("w-3.5 h-3.5", liked ? "fill-primary text-primary" : "")} />
                <span>{likesCount}</span>
              </button>
            </div>

            {/* Right: Reading time & Bookmark */}
            <div className="flex items-center gap-3">
              {article.readingTime > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t("feed.reading_time", "{count} min de lecture", { count: article.readingTime })}
                </span>
              )}
              {handleBookmarkToggle && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleBookmarkToggle(article)
                  }}
                  className={cn(
                    "p-1 hover:text-foreground transition-colors outline-none cursor-pointer",
                    isBookmarked ? "text-primary" : ""
                  )}
                  title={isBookmarked ? t("feed.bookmark_remove", "Retirer le signet") : t("feed.bookmark_add", "Ajouter aux signets")}
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

