"use client"

import React from "react"
import { cn } from "@qoe/utils"
import { ArrowUpRight } from "lucide-react"

export interface QuotedArticleData {
  id: string
  title: string
  slug: string
  isPremium?: boolean
  content?: string | null
  author?: {
    name?: string | null
    username?: string | null
    subdomain?: string | null
  } | null
}

export interface QuotedArticleCardProps {
  article: QuotedArticleData
  quotedExcerpt?: string
  onOpenArticle?: (article: QuotedArticleData) => void
  className?: string
}

export function QuotedArticleCard({
  article,
  quotedExcerpt,
  onOpenArticle,
  className,
}: QuotedArticleCardProps) {
  const authorName = article.author?.name || article.author?.username || "Auteur"
  const subdomain = article.author?.subdomain ? `${article.author.subdomain}.qoe.fi` : "qoe.fi"

  const rawText = article.content ? article.content.replace(/<[^>]*>?/gm, "").trim() : ""
  const highlightTarget = quotedExcerpt?.trim() || ""

  let beforeContext = ""
  let highlightedText = ""
  let afterContext = ""

  if (highlightTarget && rawText.includes(highlightTarget)) {
    const idx = rawText.indexOf(highlightTarget)

    // Find the nearest word boundary before
    let startIdx = Math.max(0, idx - 80);
    while (startIdx > 0 && rawText[startIdx] !== ' ') {
      startIdx++;
      if (startIdx >= idx) {
        startIdx = Math.max(0, idx - 80);
        break;
      }
    }

    // Find the nearest word boundary after
    let endIdx = Math.min(rawText.length, idx + highlightTarget.length + 80);
    while (endIdx < rawText.length && rawText[endIdx] !== ' ' && rawText[endIdx] !== '.') {
      endIdx--;
      if (endIdx <= idx + highlightTarget.length) {
        endIdx = Math.min(rawText.length, idx + highlightTarget.length + 80);
        break;
      }
    }

    beforeContext = rawText.substring(startIdx, idx).trim()
    if (startIdx > 0) beforeContext = "... " + beforeContext

    highlightedText = highlightTarget

    afterContext = rawText.substring(idx + highlightTarget.length, endIdx).trim()
    if (endIdx < rawText.length && !afterContext.endsWith('.')) afterContext += "..."
  } else if (highlightTarget) {
    highlightedText = highlightTarget
    afterContext = rawText ? " ... " + rawText.substring(0, 90) + "..." : ""
  } else if (rawText) {
    highlightedText = rawText.substring(0, 130)
    afterContext = rawText.length > 130 ? "..." : ""
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onOpenArticle) {
      onOpenArticle(article)
    } else {
      const url = article.author?.subdomain 
        ? `https://${article.author.subdomain}.qoe.fi/article/${article.slug}`
        : `/article/${article.slug}`
      window.open(url, "_blank")
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group/quote relative border border-border/30 hover:border-border/60 bg-muted/20 hover:bg-muted/35 rounded-xl p-4 transition-all duration-200 cursor-pointer space-y-3 font-sans select-none my-2.5",
        className
      )}
    >
      {/* Quiet Left Hairline Accent Indicator */}
      <div className="absolute top-3 bottom-3 left-0 w-[3px] bg-brand/80 rounded-r-full" />

      {/* Clean Header: Domain & Type */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground min-w-0">
          <span className="font-semibold text-foreground truncate">{subdomain}</span>
          <span className="opacity-40">·</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
            Article
          </span>
          {article.isPremium && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
              Premium
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover/quote:text-brand transition-colors shrink-0">
          <span>Ouvrir</span>
          <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover/quote:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Article Title */}
      <h4 className="text-base font-semibold text-foreground tracking-tight leading-snug group-hover/quote:text-brand transition-colors">
        {article.title}
      </h4>

      {/* Integrated Quoted Excerpt (Rauno Craft Style: No Boxception, No Fluorescent Yellow) */}
      {highlightedText && (
        <div className="relative pl-3 border-l-2 border-brand/50 py-0.5 space-y-1">
          <p className="text-xs sm:text-sm font-serif leading-relaxed text-foreground/90 italic">
            {beforeContext && <span className="text-muted-foreground/60 not-italic">{beforeContext} </span>}
            <span className="font-medium text-foreground not-italic bg-brand/10 text-brand-foreground px-1 py-0.5 rounded">
              "{highlightedText}"
            </span>
            {afterContext && <span className="text-muted-foreground/60 not-italic"> {afterContext}</span>}
          </p>
        </div>
      )}

      {/* Footer Credit & Action */}
      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/20 text-muted-foreground">
        <div>
          Par <span className="font-medium text-foreground">{authorName}</span>
        </div>

        <div className="flex items-center gap-1 font-medium text-xs text-brand group-hover/quote:translate-x-0.5 transition-transform">
          <span>Lire l'article</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  )
}
