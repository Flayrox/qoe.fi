"use client"

import React from "react"
import { Bookmark, Clock, ExternalLink } from "lucide-react"
import { useTranslate } from "@tolgee/react"
import { motion } from "framer-motion"
import { trackEvent } from "@/lib/analytics"

interface LibraryClientProps {
  bookmarks: any[]
}

export function LibraryClient({ bookmarks }: LibraryClientProps) {
  const { t } = useTranslate()

  const handleReadClick = (articleId: string, slug: string) => {
    trackEvent("library_article_read", { articleId, slug })
  }

  return (
    <div className="space-y-6">
      
      {/* Page header */}
      <div className="px-1">
        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
          {t("library.title", "Le Sanctuaire")}
        </h1>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          {t("library.subtitle", "Vos lectures sauvegardées et articles favoris.")}
        </p>
      </div>

      {/* Bento shell — Flat clean aesthetic */}
      <div className="flex flex-col gap-4">
        
        {bookmarks.length === 0 ? (
          <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-12 border border-[var(--border-default)] shadow-xs text-center flex flex-col items-center justify-center gap-3">
            <Bookmark className="w-10 h-10 text-[var(--text-quaternary)]" />
            <h4 className="font-bold text-sm text-[var(--text-secondary)]">
              {t("library.empty_title", "Votre sanctuaire est vide")}
            </h4>
            <p className="text-xs text-[var(--text-tertiary)] max-w-xs leading-relaxed">
              {t("library.empty_desc", "Explorez qoe.fi et sauvegardez les articles qui méritent d'être lus à tête reposée.")}
            </p>
            <motion.a 
              href="/home" 
              whileTap={{ scale: 0.98 }}
              className="bg-[var(--qoe-vermillion)] text-white px-5 py-2 rounded-[var(--radius-button)] text-xs font-bold hover:bg-[#d63d20] transition-colors mt-2"
            >
              {t("library.discover_articles", "Découvrir des articles")}
            </motion.a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bookmarks.map(b => {
              const host = b.article.author.customDomain || `${b.article.author.subdomain}.localhost:3000`
              const url = `http://${host}/article/${b.article.slug}`

              return (
                <div 
                  key={b.id} 
                  className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-5 border border-[var(--border-default)] shadow-xs flex flex-col justify-between gap-4 group hover:border-[var(--qoe-vermillion)]/20 transition-all duration-300"
                >
                  
                  {/* Top: author + reading time */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <a href={b.article.author.username ? `/@${b.article.author.username}` : "#"} className="flex items-center gap-2 group/auth">
                        {b.article.author.logoUrl ? (
                          <img src={b.article.author.logoUrl} className="w-6 h-6 rounded-[var(--radius-icon)] object-cover border border-[var(--border-default)]" />
                        ) : (
                          <div className="w-6 h-6 rounded-[var(--radius-icon)] bg-[var(--qoe-vermillion-08)] flex items-center justify-center text-[8px] font-bold text-[var(--qoe-vermillion)]">
                            {b.article.author.name?.charAt(0)}
                          </div>
                        )}
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] group-hover/auth:text-[var(--qoe-vermillion)] transition-colors">{b.article.author.name}</span>
                      </a>
                      <div className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] font-mono">
                        <Clock className="w-2.5 h-2.5" />
                        {b.article.readingTime} min
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight leading-snug group-hover:text-[var(--qoe-vermillion)] transition-colors mb-2">
                      {b.article.title}
                    </h3>
                    
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {b.article.content.replace(/<[^>]*>?/gm, '').substring(0, 120)}...
                    </p>
                  </div>

                  {/* Bottom: category + link */}
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      {b.article.category && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-chip)] text-[var(--text-secondary)]">
                          {b.article.category.name}
                        </span>
                      )}
                      <span className="text-[9px] text-[var(--text-tertiary)] font-mono">
                        {new Date(b.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <motion.a 
                      href={url} 
                      target="_blank" 
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleReadClick(b.article.id, b.article.slug)}
                      className="text-[10px] font-bold text-[var(--qoe-vermillion)] flex items-center gap-0.5 hover:underline"
                    >
                      {t("library.read", "Lire")} <ExternalLink className="w-2.5 h-2.5" />
                    </motion.a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
