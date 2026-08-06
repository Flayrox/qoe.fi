"use client"

import React from "react"
import { motion } from "framer-motion"
import { ExternalLink, UserPlus, UserCheck, Bookmark, FileText, Clock, Crown } from "lucide-react"
import { cn } from "@qoe/utils"

import { MicroPostCard } from "@/components/social/MicroPostCard"
import { useTranslate } from "@qoe/i18n"
import { routes } from "@qoe/config/routes"
import { Balancer } from "react-wrap-balancer"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card"

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
}

interface ArticleCardProps {
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
  onOpenPost?: (postId: string) => void
}

// Generates a subtle gradient based on the author name for articles without a cover image
function getAuthorGradient(name: string | null): string {
  const hues = [12, 200, 260, 140, 30, 340]
  const idx = (name?.charCodeAt(0) || 0) % hues.length
  return `linear-gradient(135deg, hsl(${hues[idx]}, 60%, 96%) 0%, hsl(${hues[(idx + 2) % hues.length]}, 40%, 98%) 100%)`
}

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
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left - width / 2
    const mouseY = e.clientY - rect.top - height / 2

    // Calcul de l'inclinaison max 0.8 degré
    const rX = -(mouseY / (height / 2)) * 0.8
    const rY = (mouseX / (width / 2)) * 0.8

    setTilt({ x: rX, y: rY })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
  }

  const isMicroPost = !article.title  const isProd = typeof window !== "undefined"
    ? window.location.hostname.endsWith("qoe.fi")
    : process.env.NODE_ENV === "production"
  const suffix = isProd ? "qoe.fi" : "localhost"
  const host = article.author.customDomain || (article.author.subdomain ? `${article.author.subdomain}.${suffix}` : null)
  const url = isMicroPost
    ? "#"
    : article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug)

  // Micro-post rendering delegated
  if (isMicroPost) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      >
        <MicroPostCard post={article} currentUserId={dbUser?.id || null} onOpenPost={onOpenPost} onOpenProfile={onOpenProfile} />
      </motion.div>
    )
  }

  const renderAuthorHoverCard = () => (
    <HoverCardContent className="w-72 p-4 bg-white border border-neutral-200/50 rounded-lg shadow-xl z-50">
      <div className="flex justify-between space-x-4">
        <div className="w-10 h-10 rounded-sm overflow-hidden border border-neutral-200/30 shrink-0">
          {article.author.logoUrl ? (
            <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)]">
              {article.author.name?.substring(0, 2) || "NA"}
            </div>
          )}
        </div>
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-neutral-900 leading-none">{article.author.name}</h4>
            {article.author.isCertified && <CertifiedBadge />}
          </div>
          <p className="text-[10px] text-neutral-450 leading-none">@{article.author.username || article.author.subdomain}</p>
          {article.author.heroText && (
            <p className="text-[10px] text-neutral-600 leading-normal line-clamp-2 pt-0.5">
              {article.author.heroText}
            </p>
          )}
          <div className="flex items-center pt-2 gap-4 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
            <span className="text-[var(--qoe-vermillion)]">Écrits certifiés</span>
            <span>12.5k abonnés</span>
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

  // ── FEATURED CARD (idx=0) — Layout horizontal éditorial ──────────────────────
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
        style={{
          perspective: 1000,
          transformStyle: "preserve-3d"
        }}
        className={cn(
          "group relative overflow-hidden cursor-pointer",
          "transition-all duration-500 ease-[0.16,1,0.3,1]",
          "border-b border-[var(--border-default)] pb-8 mb-8"
        )}
      >
        {/* À LA UNE badge */}
        <div className="absolute top-4 left-4 z-10">
          <span
            className="text-[8px] font-black uppercase tracking-[0.14em] bg-[var(--qoe-vermillion)] text-white px-2.5 py-1 rounded-full"
            style={{ boxShadow: "0 2px 8px var(--qoe-vermillion-glow)" }}
          >
            {t("feed.featured_badge", "À la une")}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* Image / Gradient — Cinémascope format */}
          <div className="sm:w-[42%] shrink-0">
            <div
              className="w-full h-48 sm:h-full min-h-[180px] aspect-[21/9] sm:aspect-auto overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-neutral-100"
              style={{ background: hasHeroImage ? undefined : getAuthorGradient(article.author.name) }}
            >
              {hasHeroImage && (
                <img
                  src={article.imageUrl!}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
                />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col justify-between py-2 pl-0 sm:pl-6">
            {/* Author */}
            <div className="flex items-center justify-between mb-5">
              <HoverCard>
                <HoverCardTrigger
                  render={
                    <motion.button
                      onClick={handleOpenProfile}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group/author outline-none cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-sm overflow-hidden border border-[var(--border-default)] shrink-0">
                        {article.author.logoUrl ? (
                          <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)]">
                            {article.author.name?.substring(0, 2) || "NA"}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight group-hover/author:text-[var(--qoe-vermillion)] transition-colors">
                            {article.author.name}
                          </span>
                          {article.author.isCertified && (
                            <CertifiedBadge />
                          )}
                        </div>
                        <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider block mt-0.5">
                          @{article.author.username || article.author.subdomain} · {formattedDate}
                        </span>
                      </div>
                    </motion.button>
                  }
                />
                {renderAuthorHoverCard()}
              </HoverCard>

              {dbUser && dbUser.id !== article.author.id && (
                <FollowButton isFollowed={isFollowed} onToggle={() => handleFollowToggle(article.author)} />
              )}
            </div>

            {/* Title + Excerpt */}
            <a href={url} target="_blank" rel="noreferrer" onClick={handleOpenInTab} className="block group/title flex-1">
              <h3 className="font-serif text-[22px] sm:text-[26px] font-bold text-[var(--text-primary)] leading-[1.2] tracking-tight mb-3 group-hover/title:text-[var(--qoe-vermillion)] transition-colors duration-300">
                <Balancer>{article.title}</Balancer>
              </h3>
              <p className="font-serif text-[14px] text-[var(--text-secondary)] leading-[1.75] line-clamp-3 text-fade-gradient font-editorial">
                {article.content.replace(/<[^>]*>?/gm, "").substring(0, 260)}
              </p>
            </a>

            {/* Footer */}
            <CardFooter
              article={article}
              isBookmarked={isBookmarked}
              handleBookmarkToggle={handleBookmarkToggle}
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
      animate={{ 
        opacity: 1, 
        y: 0,
        rotateX: tilt.x,
        rotateY: tilt.y,
      }}
      whileTap={{ scale: 0.99 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: 1000,
        transformStyle: "preserve-3d"
      }}
      className={cn(
        "group relative overflow-hidden",
        "transition-all duration-500 ease-[0.16,1,0.3,1]",
        "border-b border-[var(--border-default)] pb-8 mb-8"
      )}
    >
      {/* Cover image — Cinémascope 21/9 */}
      {hasHeroImage && (
        <div className="w-full aspect-[21/9] overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-neutral-100">
          <img
            src={article.imageUrl!}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="py-4 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <HoverCard>
            <HoverCardTrigger
              render={
                <motion.button
                  onClick={handleOpenProfile}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 rounded-[var(--radius-icon)]"
                >
                  <div className="w-9 h-9 rounded-sm overflow-hidden border border-[var(--border-default)] shrink-0 transition-transform duration-500 ease-[0.16,1,0.3,1] group-hover/author:scale-105">
                    {article.author.logoUrl ? (
                      <img src={article.author.logoUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)]">
                        {article.author.name?.substring(0, 2) || "NA"}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight leading-none group-hover/author:text-[var(--qoe-vermillion)] transition-colors duration-200">
                        {article.author.name}
                      </span>
                      {article.author.isCertified && <CertifiedBadge />}
                    </div>
                    <span className="text-[9px] text-[var(--text-tertiary)] block mt-1 uppercase tracking-wider">
                      @{article.author.username || article.author.subdomain} · {formattedDate}
                    </span>
                  </div>
                </motion.button>
              }
            />
            {renderAuthorHoverCard()}
          </HoverCard>

          {/* Actions header */}
          <div className="flex items-center gap-1.5">
            {dbUser && dbUser.id !== article.author.id && (
              <FollowButton isFollowed={isFollowed} onToggle={() => handleFollowToggle(article.author)} />
            )}
            {/* Bookmark */}
            <MagneticButton
              onClick={() => handleBookmarkToggle(article)}
              className={cn(
                "p-2 rounded-[var(--radius-button)] transition-all duration-300 cursor-pointer",
                "focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none",
                "opacity-0 group-hover:opacity-100",
                isBookmarked
                  ? "!opacity-100 bg-[var(--qoe-vermillion-08)] text-[var(--qoe-vermillion)]"
                  : "bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--qoe-vermillion)]"
              )}
              aria-label={isBookmarked ? t("feed.bookmark_remove", "Retirer le signet") : t("feed.bookmark_add", "Ajouter aux signets")}
            >
              <Bookmark
                className="w-3.5 h-3.5"
                style={{ fill: isBookmarked ? "currentColor" : "transparent" }}
                strokeWidth={1.5}
              />
            </MagneticButton>
          </div>
        </div>

        {/* Content — title + abstract */}
        <div className="space-y-2.5">
          <a href={url} target="_blank" rel="noreferrer" className="block group/title">
            <h3 className={cn(
              "font-serif font-bold text-[var(--text-primary)] leading-[1.25] tracking-tight",
              "group-hover/title:text-[var(--qoe-vermillion)] transition-colors duration-300",
              "text-[20px] sm:text-[22px]"
            )}>
              <Balancer>{article.title}</Balancer>
            </h3>
          </a>
          <p className="font-serif text-[14px] text-[var(--text-secondary)] leading-[1.75] line-clamp-2 text-fade-gradient font-editorial">
            {article.content.replace(/<[^>]*>?/gm, "").substring(0, 200)}
          </p>
        </div>

        {/* Footer */}
        <CardFooter
          article={article}
          isBookmarked={isBookmarked}
          handleBookmarkToggle={handleBookmarkToggle}
          handleOpenInTab={handleOpenInTab}
          url={url}
        />
      </div>
    </motion.article>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CertifiedBadge() {
  const { t } = useTranslate()
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={t("feed.certified_author", "Auteur certifié")}>
      <circle cx="7" cy="7" r="7" fill="var(--qoe-vermillion)" />
      <path d="M4.5 7L6.3 8.8L9.5 5.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FollowButton({ isFollowed, onToggle }: { isFollowed: boolean; onToggle: () => void }) {
  const { t } = useTranslate()
  return (
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-[var(--radius-button)]",
        "transition-all duration-300 ease-[0.16,1,0.3,1] cursor-pointer",
        "focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none",
        isFollowed
          ? "bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:bg-red-50 hover:text-red-400"
          : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--qoe-vermillion)] hover:text-white"
      )}
    >
      {isFollowed
        ? <><UserCheck className="w-3 h-3" /><span>{t("feed.subscribed", "Abonné")}</span></>
        : <><UserPlus className="w-3 h-3" /><span>{t("feed.subscribe", "Suivre")}</span></>
      }
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
  handleBookmarkToggle: (a: Article) => void
  handleOpenInTab: () => void
  url: string
}) {
  const { t } = useTranslate()
  return (
    <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-2">
      {/* Left : Category · Time · Premium */}
      <div className="flex items-center gap-2">
        {article.category && (
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-sans">
            {article.category.name}
          </span>
        )}

        {article.readingTime > 0 && (
          <>
            {article.category && <span className="text-[var(--text-quaternary)] text-xs">·</span>}
            <span className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] font-sans">
              <Clock className="w-2.5 h-2.5" strokeWidth={2} />
              {t("feed.reading_time", { count: article.readingTime })}
            </span>
          </>
        )}

        {article.isPremium && (
          <>
            <span className="text-[var(--text-quaternary)] text-xs">·</span>
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--qoe-vermillion)] font-sans">
              <Crown className="w-2.5 h-2.5" />
              {t("feed.premium_badge", "Premium")}
            </span>
          </>
        )}
      </div>

      {/* Right : Floating Action Hub */}
      <div className="flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-neutral-200/40 rounded-full p-1 shadow-[0_3px_10px_rgba(0,0,0,0.03)] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-0.5 group-hover:translate-y-0">
        <MagneticButton
          onClick={handleOpenInTab}
          className="p-1.5 text-neutral-450 hover:text-[var(--qoe-vermillion)] hover:bg-[var(--qoe-vermillion-08)] rounded-full transition-colors outline-none cursor-pointer flex items-center justify-center"
          title={t("feed.tab_label", "Onglet")}
        >
          <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
        </MagneticButton>
        <span className="w-[1px] h-3 bg-neutral-200" />
        <MagneticButton
          onClick={(e) => {
            e.preventDefault()
            window.open(url, "_blank", "noreferrer")
          }}
          className="p-1.5 text-neutral-450 hover:text-[var(--qoe-vermillion)] hover:bg-[var(--qoe-vermillion-08)] rounded-full transition-colors outline-none cursor-pointer flex items-center justify-center"
          title={t("feed.read_btn", "Lire")}
        >
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
        </MagneticButton>
      </div>
    </div>
  )
}

interface MagneticButtonProps {
  children: React.ReactNode
  className?: string
  range?: number
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  title?: string
  "aria-label"?: string
}

export function MagneticButton({ children, className, range = 15, onClick, title, "aria-label": ariaLabel }: MagneticButtonProps) {
  const [position, setPosition] = React.useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX, clientY, currentTarget } = e
    const { left, top, width, height } = currentTarget.getBoundingClientRect()
    const centerX = left + width / 2
    const centerY = top + height / 2
    const distanceX = clientX - centerX
    const distanceY = clientY - centerY

    setPosition({ x: distanceX * 0.35, y: distanceY * 0.35 })
  }

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 })
  }

  return (
    <motion.button
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 450, damping: 28, mass: 0.6 }}
      className={className}
    >
      {children}
    </motion.button>
  )
}
