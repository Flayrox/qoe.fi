"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ExternalLink, UserPlus, UserCheck, Bookmark, BookMarked, FileText, Clock, Crown } from "lucide-react"
import { cn } from "@qoe/utils"

import { ThoughtCard } from "@/components/social/ThoughtCard"
import { useTranslate } from "@qoe/i18n"
import { routes } from "@qoe/config/routes"
import { Balancer } from "react-wrap-balancer"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"

interface Author {
  id: string
  name: string | null
  username: string | null
  subdomain: string | null
  customDomain: string | null
  logoUrl: string | null
  heroText: string | null
  isCertified?: boolean
}

interface Article {
  id: string
  title: string
  slug: string
  content: string
  imageUrl?: string | null
  published: boolean
  isPremium: boolean
  readingTime: number
  createdAt: Date | string
  author: Author
  category: { name: string } | null
  tags?: string[]
  parent?: any
  repost?: any
}

export interface ArticleCardProps {
  article: Article
  idx: number
  dbUser: any
  isBookmarked: boolean
  isFollowed: boolean
  handleFollowToggle: (author: any) => void
  handleBookmarkToggle: (article: Article) => void
  featured?: boolean
  onOpenArticle?: (article: Article) => void
  onOpenProfile?: (username: string) => void
  onOpenPost?: (postId: string, authorUsername?: string) => void
}

function getAuthorGradient(name: string | null): string {
  const hues = [12, 200, 260, 140, 30, 340]
  const idx = (name?.charCodeAt(0) || 0) % hues.length
  return `linear-gradient(135deg, hsl(${hues[idx]}, 60%, 96%) 0%, hsl(${hues[(idx + 2) % hues.length]}, 40%, 98%) 100%)`
}

/**
 * 📰 ArticleCard — Carte d'article principale avec 0ms Optimistic UI
 * Conforme au Compound Component Pattern & Onyx Theme Tokens (AGENTS.md)
 */
export function ArticleCard({
  article,
  idx,
  dbUser,
  isBookmarked,
  isFollowed,
  handleFollowToggle,
  handleBookmarkToggle,
  featured = false,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const { t } = useTranslate()
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  // ⚡ 0ms Optimistic UI States
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked)
  const [localFollowed, setLocalFollowed] = useState(isFollowed)

  useEffect(() => {
    setLocalBookmarked(isBookmarked)
  }, [isBookmarked])

  useEffect(() => {
    setLocalFollowed(isFollowed)
  }, [isFollowed])

  const onToggleBookmarkLocal = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLocalBookmarked(prev => !prev)
    handleBookmarkToggle(article)
  }

  const onToggleFollowLocal = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLocalFollowed(prev => !prev)
    handleFollowToggle(article.author)
  }

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

  const isThought = !article.title
  const isProd = typeof window !== "undefined"
    ? window.location.hostname.endsWith("qoe.fi")
    : process.env.NODE_ENV === "production"
  const suffix = isProd ? "qoe.fi" : "localhost"
  const host = article.author.customDomain || (article.author.subdomain ? `${article.author.subdomain}.${suffix}` : null)
  const url = isThought
    ? "#"
    : article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug)

  if (isThought) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      >
        <ThoughtCard post={article} currentUserId={dbUser?.id || null} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} />
      </motion.div>
    )
  }

  const renderAuthorHoverCard = () => (
    <HoverCardContent className="w-72 p-4 bg-card border border-border/40 rounded-xl shadow-xl z-50 font-sans">
      <div className="flex justify-between space-x-4">
        <div className="w-10 h-10 rounded-md overflow-hidden border border-border/40 shrink-0">
          {article.author.logoUrl ? (
            <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-brand/10 flex items-center justify-center font-bold text-xs text-brand">
              {article.author.name?.substring(0, 2) || "NA"}
            </div>
          )}
        </div>
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-foreground leading-none">{article.author.name}</h4>
            {article.author.isCertified && <CertifiedBadge />}
          </div>
          <p className="text-[10px] text-muted-foreground leading-none">@{article.author.username || article.author.subdomain}</p>
          {article.author.heroText && (
            <p className="text-[10px] text-muted-foreground leading-normal line-clamp-2 pt-0.5">
              {article.author.heroText}
            </p>
          )}
          <div className="flex items-center pt-2 gap-4 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="text-brand">Écrits certifiés</span>
            <span>Abonnés</span>
          </div>
        </div>
      </div>
    </HoverCardContent>
  )

  const handleOpenInTab = () => {
    if (onOpenArticle) {
      onOpenArticle(article)
    }
  }

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

  const formattedDate = new Date(article.createdAt).toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric"
  })

  const hasHeroImage = !!article.imageUrl

  // ── FEATURED CARD ────────────────────────────────────────────────────────────
  if (featured) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ 
          opacity: 1, 
          y: 0,
          rotateX: tilt.x,
          rotateY: tilt.y,
        }}
        whileTap={{ scale: 0.99 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "group relative rounded-2xl bg-card border border-border/40 shadow-xs overflow-hidden",
          "hover:border-border/80 transition-all duration-300 font-sans"
        )}
      >
        <div className="flex flex-col md:flex-row items-stretch">
          {/* Cover Hero */}
          <div className="w-full md:w-5/12 relative min-h-[220px] md:min-h-full overflow-hidden bg-muted">
            {hasHeroImage ? (
              <img
                src={article.imageUrl!}
                alt={article.title}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
              />
            ) : (
              <div 
                className="w-full h-full min-h-[220px] flex items-center justify-center p-8 relative overflow-hidden"
                style={{ background: getAuthorGradient(article.author.name) }}
              >
                <span className="font-serif text-[70px] md:text-[90px] font-black text-foreground/10 select-none leading-none">
                  {article.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              <span className="px-2.5 py-1 rounded-full bg-background/80 backdrop-blur-md text-[10px] font-bold text-foreground tracking-wider uppercase border border-border/40">
                À la une
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="w-full md:w-7/12 p-6 md:p-8 flex flex-col justify-between gap-4">
            {/* Author */}
            <div className="flex items-center justify-between">
              <HoverCard>
                <HoverCardTrigger>
                  <motion.button
                    onClick={handleOpenProfile}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group/author outline-none cursor-pointer"
                  >
                    <AuthorAvatar user={article.author} size="sm" showBadge={false} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-foreground tracking-tight group-hover/author:text-brand transition-colors">
                          {article.author.name}
                        </span>
                        {article.author.isCertified && <CertifiedBadge />}
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-0.5">
                        @{article.author.username || article.author.subdomain} · {formattedDate}
                      </span>
                    </div>
                  </motion.button>
                </HoverCardTrigger>
                {renderAuthorHoverCard()}
              </HoverCard>

              {dbUser && dbUser.id !== article.author.id && (
                <FollowButton isFollowed={localFollowed} onToggle={onToggleFollowLocal} />
              )}
            </div>

            {/* Title + Content */}
            <a href={url} target="_blank" rel="noreferrer" onClick={handleOpenInTab} className="block group/title flex-1">
              <h3 className="font-serif text-[22px] sm:text-[26px] font-bold text-foreground leading-[1.2] tracking-tight mb-3 group-hover/title:text-brand transition-colors duration-300">
                <Balancer>{article.title}</Balancer>
              </h3>
              <p className="font-serif text-[14px] text-muted-foreground leading-[1.75] line-clamp-3">
                {article.content.replace(/<[^>]*>?/gm, "").substring(0, 260)}
              </p>
            </a>

            {/* Footer */}
            <CardFooter
              article={article}
              isBookmarked={localBookmarked}
              handleBookmarkToggle={onToggleBookmarkLocal}
              handleOpenInTab={handleOpenInTab}
              url={url}
            />
          </div>
        </div>
      </motion.article>
    )
  }

  // ── STANDARD CARD ────────────────────────────────────────────────────────────
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative rounded-2xl bg-card border border-border/40 shadow-xs overflow-hidden flex flex-col justify-between p-6",
        "hover:border-border/80 transition-all duration-300 font-sans"
      )}
    >
      <div className="space-y-4">
        {/* Cover Hero */}
        {hasHeroImage && (
          <div className="w-full h-44 rounded-xl overflow-hidden bg-muted border border-border/20 mb-4">
            <img
              src={article.imageUrl!}
              alt={article.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
          </div>
        )}

        {/* Header Author */}
        <div className="flex items-center justify-between">
          <HoverCard>
            <HoverCardTrigger>
              <motion.button
                onClick={handleOpenProfile}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group/author outline-none cursor-pointer"
              >
                <AuthorAvatar user={article.author} size="sm" showBadge={false} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground truncate group-hover/author:text-brand transition-colors">
                      {article.author.name}
                    </span>
                    {article.author.isCertified && <CertifiedBadge />}
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-0.5">
                    @{article.author.username || article.author.subdomain} · {formattedDate}
                  </span>
                </div>
              </motion.button>
            </HoverCardTrigger>
            {renderAuthorHoverCard()}
          </HoverCard>

          {dbUser && dbUser.id !== article.author.id && (
            <FollowButton isFollowed={localFollowed} onToggle={onToggleFollowLocal} />
          )}
        </div>

        {/* Title + Content */}
        <a href={url} target="_blank" rel="noreferrer" onClick={handleOpenInTab} className="block group/title">
          <h3 className="font-serif text-lg font-bold text-foreground leading-snug tracking-tight mb-2 group-hover/title:text-brand transition-colors duration-200">
            <Balancer>{article.title}</Balancer>
          </h3>
          <p className="font-serif text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {article.content.replace(/<[^>]*>?/gm, "").substring(0, 180)}
          </p>
        </a>
      </div>

      {/* Footer */}
      <CardFooter
        article={article}
        isBookmarked={localBookmarked}
        handleBookmarkToggle={onToggleBookmarkLocal}
        handleOpenInTab={handleOpenInTab}
        url={url}
      />
    </motion.article>
  )
}

function FollowButton({ isFollowed, onToggle }: { isFollowed: boolean; onToggle: (e: React.MouseEvent) => void }) {
  const { t } = useTranslate()
  return (
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full",
        "transition-all duration-200 cursor-pointer outline-none select-none",
        isFollowed
          ? "bg-muted text-muted-foreground hover:bg-muted/80"
          : "bg-primary text-primary-foreground hover:opacity-90 shadow-xs"
      )}
    >
      {isFollowed ? (
        <>
          <UserCheck className="w-3 h-3 text-emerald-500" />
          <span>{t("feed.subscribed", "Abonné")}</span>
        </>
      ) : (
        <>
          <UserPlus className="w-3 h-3" />
          <span>{t("feed.subscribe", "Suivre")}</span>
        </>
      )}
    </motion.button>
  )
}

function CardFooter({
  article,
  isBookmarked,
  handleBookmarkToggle,
  handleOpenInTab,
  url,
}: {
  article: Article
  isBookmarked: boolean
  handleBookmarkToggle: (e: React.MouseEvent) => void
  handleOpenInTab: () => void
  url: string
}) {
  const { t } = useTranslate()
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border/30 mt-4">
      {/* Left : Category · Time · Premium */}
      <div className="flex items-center gap-2">
        {article.category && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {article.category.name}
          </span>
        )}

        {article.readingTime > 0 && (
          <>
            {article.category && <span className="text-muted-foreground/60 text-xs">·</span>}
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
              {t("feed.reading_time", { count: article.readingTime })}
            </span>
          </>
        )}

        {article.isPremium && (
          <>
            <span className="text-muted-foreground/60 text-xs">·</span>
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-500">
              <Crown className="w-2.5 h-2.5" />
              {t("feed.premium_badge", "Premium")}
            </span>
          </>
        )}
      </div>

      {/* Right : Action Buttons (0ms) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          type="button"
          onClick={handleBookmarkToggle}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            isBookmarked
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title={isBookmarked ? "Retirer de la bibliothèque" : "Mettre en signet"}
        >
          {isBookmarked ? (
            <BookMarked className="w-3.5 h-3.5 fill-primary" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleOpenInTab}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Lire"
        >
          <FileText className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// 🧩 Compound Component Pattern Exports
ArticleCard.Root = ArticleCard
ArticleCard.Footer = CardFooter
