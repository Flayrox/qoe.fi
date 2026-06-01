"use client"

import React from "react"
import { Bookmark, Clock, ExternalLink } from "lucide-react"
import { useTranslate } from "@tolgee/react"
import { motion } from "framer-motion"
import { trackEvent } from "@/lib/analytics"

import { Logo } from "@/components/ui/Logo"

interface LibraryClientProps {
  bookmarks: any[]
}

export function LibraryClient({ bookmarks }: LibraryClientProps) {
  const { t } = useTranslate()

  const handleReadClick = (articleId: string, slug: string) => {
    trackEvent("library_article_read", { articleId, slug })
  }

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#faf7f5]" />
        
        <div 
          className="absolute bottom-[-20%] left-[-15%] w-[80%] h-[70%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(238,75,43,0.12) 0%, rgba(238,75,43,0.06) 35%, rgba(238,75,43,0.02) 60%, transparent 80%)",
            filter: "blur(60px)",
          }}
        />
        
        <div 
          className="absolute top-[-10%] right-[-10%] w-[60%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,180,140,0.15) 0%, rgba(255,200,170,0.08) 40%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        <div 
          className="absolute top-[30%] left-[30%] w-[50%] h-[50%] rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,230,215,0.2) 0%, transparent 60%)",
            filter: "blur(100px)",
          }}
        />

        <div 
          className="absolute top-0 right-0 bottom-0 w-[35%]"
          style={{
            background: "linear-gradient(to left, rgba(250,247,245,0.95) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* ── MAIN CONTENT (z-20) ── */}
      <div className="pt-[30vh] pb-24 max-w-[640px] mx-auto selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)] relative z-20">
        
        {/* ── LOGO LAYER (z-10) ── */}
        <div className="sticky top-[28px] z-10 w-full flex justify-center bg-transparent pointer-events-none h-0">
          <div className="w-full max-w-[640px] px-2 flex items-center gap-6 relative">
            <div className="absolute left-[-84px] w-16 h-8 flex items-center justify-center top-5">
              <a href="/home" className="flex items-center justify-center w-8 h-8 pointer-events-auto">
                <Logo className="h-[13px] w-auto" fillColor="#EE4B2B" />
              </a>
            </div>
          </div>
        </div>

        {/* Real "Signets." title positioned sticky so it sticks at top and is covered by the sheet */}
        <div className="sticky top-0 h-0 z-10 pointer-events-none select-none">
          <div className="absolute left-2 top-1">
            <span className="font-sans text-5xl font-extrabold text-[var(--qoe-vermillion)] tracking-tighter">
              Signets<span className="text-[var(--text-primary)]">.</span>
            </span>
          </div>
        </div>

        <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.02)] border border-neutral-200/40 rounded-t-xl min-h-screen mt-12 relative z-20">
          
          {/* Sticky header of the sheet itself to mask the contents */}
          <div className="sticky top-0 z-10 h-[60px] bg-white rounded-t-xl border-t border-x border-neutral-200/40 -mx-[1px] -mt-[1px]" />

          <div className="px-6 pb-6 space-y-6">
            
            {/* Page header inside the sheet */}
            <div className="px-1">
              <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {t("library.title", "Le Sanctuaire")}
              </h1>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {t("library.subtitle", "Vos lectures sauvegardées et articles favoris.")}
              </p>
            </div>

            {/* Bento shell */}
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
        </div>
      </div>
    </>
  )
}
