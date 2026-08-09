"use client"

import React from "react"
import { motion } from "framer-motion"
import { BookMarked, Bookmark, Share2, ArrowUpRight, Clock } from "lucide-react"
import { AuthorAvatar } from "@/components/ui/AuthorAvatar"
import { CertifiedBadge } from "@/components/ui/CertifiedBadge"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config/routes"

export interface ArticleRowProps {
  article: {
    id: string
    title: string
    slug: string
    readingTime: number
    imageUrl?: string | null
    isPremium?: boolean
    published?: boolean
    createdAt: Date | string
    author: {
      id: string
      name: string | null
      username: string | null
      logoUrl: string | null
      isCertified?: boolean
    }
    category?: { name: string } | null
  }
  isBookmarked?: boolean
  onBookmarkToggle?: (articleId: string) => void
  onOpenArticle?: (slug: string) => void
  className?: string
}

/**
 * 🎵 ArticleRow — Format d'affichage épuré en rangée fluide (48px-56px)
 * Inspiré du design épuré d'Apple Music Web (design/DESIGN.md §5.B)
 */
export function ArticleRow({
  article,
  isBookmarked = false,
  onBookmarkToggle,
  onOpenArticle,
  className,
}: ArticleRowProps) {
  const handleClick = () => {
    if (onOpenArticle) {
      onOpenArticle(article.slug)
    } else {
      window.location.href = routes.feed.article(article.slug)
    }
  }

  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={handleClick}
      className={cn(
        "group flex items-center justify-between gap-3 h-14 px-3.5 rounded-xl",
        "bg-card/40 hover:bg-muted/50 border border-border/30 hover:border-border/60",
        "transition-all duration-200 cursor-pointer select-none",
        className
      )}
    >
      {/* Surface Gauche : QuietDot + Miniature + Informations */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* QuietDot (Indicateur discret émeraude/gris) */}
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            article.published !== false ? "bg-emerald-500 shadow-xs" : "bg-muted-foreground/40"
          )}
          title={article.published !== false ? "Publié" : "Brouillon"}
        />

        {/* Miniature carrée (36px) */}
        <div className="h-9 w-9 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/20">
          {article.imageUrl ? (
            <img
              src={article.imageUrl}
              alt={article.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-[10px] font-bold">
              {article.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Titre & Auteur */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {article.title}
            </h3>
            {article.isPremium && (
              <span className="px-1.5 py-0.5 rounded-xs bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-bold uppercase tracking-wider shrink-0">
                Premium
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/80 truncate">
              {article.author.name || `@${article.author.username}`}
            </span>
            {article.author.isCertified && <CertifiedBadge className="w-2.5 h-2.5" />}
            <span>•</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {article.readingTime} min
            </span>
            {article.category?.name && (
              <>
                <span>•</span>
                <span className="truncate">{article.category.name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Surface Droite : Actions au Survol (0ms) */}
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {onBookmarkToggle && (
          <button
            type="button"
            onClick={() => onBookmarkToggle(article.id)}
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
        )}
        <button
          type="button"
          onClick={handleClick}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Lire l'article"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}
