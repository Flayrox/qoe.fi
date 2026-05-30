"use client"

import React from "react"
import { motion } from "framer-motion"
import { ExternalLink, UserPlus, UserCheck, Bookmark, FileText, Clock, Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/lib/use-tab-store"
import { MicroPostCard } from "@/components/social/MicroPostCard"

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
  featured?: boolean   // First card in feed — larger editorial treatment
}


// Génère un gradient subtil basé sur le nom de l'auteur (pour les articles sans image)
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
}: ArticleCardProps) {
  const { addTab } = useTabStore()
  const isMicroPost = !article.title
  const host = article.author.customDomain || `${article.author.subdomain}.localhost:3000`
  const url = isMicroPost ? "#" : `http://${host}/article/${article.slug}`

  // Micro-post — rendu délégué au composant dédié
  if (isMicroPost) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
      >
        <MicroPostCard post={article} />
      </motion.div>
    )
  }

  const handleOpenInTab = () => {
    addTab({
      id: `article-${article.slug}`,
      title: article.title,
      type: "article",
      slug: article.slug
    })
  }

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const targetUsername = article.author.username || article.author.subdomain
    if (!targetUsername) return
    addTab({
      id: `profile-${targetUsername}`,
      title: `@${targetUsername}`,
      type: "profile",
      slug: targetUsername
    })
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
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
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
            À la une
          </span>
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* Image / Gradient */}
          <div className="sm:w-[42%] shrink-0">
            <div
              className="w-full h-48 sm:h-full min-h-[180px] overflow-hidden"
              style={{ background: hasHeroImage ? undefined : getAuthorGradient(article.author.name) }}
            >
              {hasHeroImage && (
                <img
                  src={article.imageUrl!}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col justify-between py-2 pl-0 sm:pl-6">
            {/* Author */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={handleOpenProfile}
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity group/author outline-none"
              >
                <div className="w-8 h-8 rounded-[var(--radius-icon)] overflow-hidden border border-[var(--border-default)] shrink-0">
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
              </button>

              {dbUser && dbUser.id !== article.author.id && (
                <FollowButton isFollowed={isFollowed} onToggle={() => handleFollowToggle(article.author)} />
              )}
            </div>

            {/* Title + Excerpt */}
            <a href={url} target="_blank" rel="noreferrer" onClick={handleOpenInTab} className="block group/title flex-1">
              <h3 className="font-serif text-[22px] sm:text-[26px] font-bold text-[var(--text-primary)] leading-[1.2] tracking-tight mb-3 group-hover/title:text-[var(--qoe-vermillion)] transition-colors duration-300">
                {article.title}
              </h3>
              <p className="font-serif text-[14px] text-[var(--text-secondary)] leading-[1.75] line-clamp-3">
                {article.content.replace(/<[^>]*>?/gm, "").substring(0, 240)}…
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
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative overflow-hidden",
        "transition-all duration-500 ease-[0.16,1,0.3,1]",
        "border-b border-[var(--border-default)] pb-8 mb-8"
      )}
    >
      {/* Hero Image — pleine largeur si présente */}
      {hasHeroImage && (
        <div className="w-full aspect-[16/9] overflow-hidden">
          <img
            src={article.imageUrl!}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="py-4 flex flex-col gap-5">
        {/* Header : Auteur + Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleOpenProfile}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group/author outline-none text-left focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 rounded-[var(--radius-icon)]"
          >
            <div className="w-9 h-9 rounded-[var(--radius-icon)] overflow-hidden border border-[var(--border-default)] shrink-0 transition-transform duration-500 ease-[0.16,1,0.3,1] group-hover/author:scale-105">
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
          </button>

          {/* Actions header */}
          <div className="flex items-center gap-1.5">
            {dbUser && dbUser.id !== article.author.id && (
              <FollowButton isFollowed={isFollowed} onToggle={() => handleFollowToggle(article.author)} />
            )}
            {/* Bookmark — visible uniquement au hover de la carte */}
            <button
              onClick={() => handleBookmarkToggle(article)}
              className={cn(
                "p-2 rounded-[var(--radius-button)] transition-all duration-300 cursor-pointer",
                "focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none",
                "opacity-0 group-hover:opacity-100",
                isBookmarked
                  ? "!opacity-100 bg-[var(--qoe-vermillion-08)] text-[var(--qoe-vermillion)]"
                  : "bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--qoe-vermillion)]"
              )}
              aria-label={isBookmarked ? "Retirer le signet" : "Ajouter aux signets"}
            >
              <Bookmark
                className="w-3.5 h-3.5"
                style={{ fill: isBookmarked ? "currentColor" : "transparent" }}
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>

        {/* Contenu — titre + extrait */}
        <div className="space-y-2.5">
          <a href={url} target="_blank" rel="noreferrer" className="block group/title">
            <h3 className={cn(
              "font-serif font-bold text-[var(--text-primary)] leading-[1.25] tracking-tight",
              "group-hover/title:text-[var(--qoe-vermillion)] transition-colors duration-300",
              "text-[20px] sm:text-[22px]"
            )}>
              {article.title}
            </h3>
          </a>
          <p className="font-serif text-[14px] text-[var(--text-secondary)] leading-[1.75] line-clamp-2">
            {article.content.replace(/<[^>]*>?/gm, "").substring(0, 200)}…
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
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Auteur certifié">
      <circle cx="7" cy="7" r="7" fill="#EE4B2B" />
      <path d="M4.5 7L6.3 8.8L9.5 5.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FollowButton({ isFollowed, onToggle }: { isFollowed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
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
        ? <><UserCheck className="w-3 h-3" /><span>Abonné</span></>
        : <><UserPlus className="w-3 h-3" /><span>Suivre</span></>
      }
    </button>
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
  return (
    <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-2">
      {/* Left : Catégorie · Temps · Premium */}
      <div className="flex items-center gap-2">
        {article.category && (
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-mono">
            {article.category.name}
          </span>
        )}

        {article.readingTime > 0 && (
          <>
            {article.category && <span className="text-[var(--text-quaternary)] text-xs">·</span>}
            <span className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] font-mono">
              <Clock className="w-2.5 h-2.5" strokeWidth={2} />
              {article.readingTime} min
            </span>
          </>
        )}

        {article.isPremium && (
          <>
            <span className="text-[var(--text-quaternary)] text-xs">·</span>
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--qoe-vermillion)] font-mono">
              <Crown className="w-2.5 h-2.5" />
              Premium
            </span>
          </>
        )}
      </div>

      {/* Right : Actions — apparaissent au hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button
          onClick={handleOpenInTab}
          className="text-[10px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--qoe-vermillion)] flex items-center gap-1.5 transition-colors duration-200 cursor-pointer px-2 py-1.5 rounded-[8px] hover:bg-[var(--qoe-vermillion-08)] focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none"
        >
          <FileText className="w-3 h-3" strokeWidth={1.5} />
          Onglet
        </button>
        <span className="text-[var(--border-strong)] text-xs">|</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--qoe-vermillion)] flex items-center gap-1.5 transition-colors duration-200 px-2 py-1.5 rounded-[8px] hover:bg-[var(--qoe-vermillion-08)] focus-visible:ring-2 focus-visible:ring-[var(--qoe-vermillion)]/30 outline-none"
        >
          Lire <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
        </a>
      </div>
    </div>
  )
}
