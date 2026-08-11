"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Globe, FileText, Loader2, ArrowUpRight } from "lucide-react"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config/routes"


interface LinkPreviewProps {
  urls: string[]
  quotedExcerpt?: string
  onNavigate?: (target: { type: 'post' | 'article' | 'profile'; id: string; slug?: string }) => void
}

export function LinkPreview({ urls, quotedExcerpt, onNavigate }: LinkPreviewProps) {
  const [preview, setPreview] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const urlsKey = urls.join(",")

  useEffect(() => {
    let active = true

    async function fetchFirstValidPreview() {
      if (urls.length === 0) return
      setLoading(true)

      try {
        const { unfurlUrlAction } = await import("@qoe/api-client/actions/feed")

        for (const url of urls) {
          if (!active) break
          const res = await unfurlUrlAction(url)

          if (res.ok && res.data) {
            const previewData = res.data
            // We count as "valid" if it is an internal post/article or has rich metadata (image or description)
            const hasRichMetadata =
              previewData.isInternal ||
              (previewData.externalMetadata &&
                (previewData.externalMetadata.image || previewData.externalMetadata.description))

            if (hasRichMetadata) {
              if (active) {
                setPreview(previewData)
                break
              }
            }
          }
        }
      } catch (err) {
        console.error("Preview unfurl loop error:", err)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchFirstValidPreview()

    return () => {
      active = false
    }
  }, [urlsKey])

  if (loading) {
    return (
      <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex items-center justify-center gap-3 bg-[var(--surface-1)]">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--qoe-vermillion)]" />
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Chargement de l'aperçu...</span>
      </div>
    )
  }

  if (!preview) return null

  // 1. Rendu d'un Post interne (Quoted Post)
  if (preview.isInternal && preview.postType === "post") {
    const post = preview.data
    const authorName = post.author.name || "Auteur"
    const authorHandle = post.author.username || post.author.subdomain

    return (
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (onNavigate) {
            onNavigate({ type: 'post', id: post.id })
          }
        }}
        className="group/quote border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 bg-[var(--surface-0)] hover:bg-[var(--surface-2)] transition-all duration-300 cursor-pointer flex flex-col gap-2 mt-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-[var(--radius-icon)] overflow-hidden border border-[var(--border-default)] shrink-0">
            {post.author.logoUrl ? (
              <img src={post.author.logoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[8px] text-[var(--qoe-vermillion)]">
                {authorName.charAt(0)}
              </div>
            )}
          </div>
          <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover/quote:text-[var(--qoe-vermillion)] transition-colors">
            {authorName}
          </span>
          {post.author.isCertified && <span className="text-[var(--qoe-vermillion)] text-[9px]">✓</span>}
          <span className="text-[9px] text-[var(--text-tertiary)]">
            @{authorHandle}
          </span>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-3">
          {post.content}
        </p>
        {post.imageUrl && (
          <div className="text-[9px] text-[var(--text-tertiary)] flex items-center gap-1 mt-1">
            <Globe className="w-3 h-3" />
            <span>Contient des images</span>
          </div>
        )}
      </div>
    )
  }

  // 2. Rendu d'un Article interne (Quoted Article - Apple Reader Highlight Style)
  if (preview.isInternal && preview.postType === "article") {
    const article = preview.data
    const authorName = article.author?.name || article.author?.username || "Auteur"
    const subdomain = article.author?.subdomain ? `${article.author.subdomain}.qoe.fi` : "qoe.fi"

    const rawText = article.content ? article.content.replace(/<[^>]*>?/gm, "") : ""
    const highlightTarget = quotedExcerpt || ""
    
    let beforeContext = ""
    let highlightedText = ""
    let afterContext = ""

    if (highlightTarget && rawText.includes(highlightTarget)) {
      const idx = rawText.indexOf(highlightTarget)
      beforeContext = rawText.substring(Math.max(0, idx - 80), idx)
      if (idx - 80 > 0) beforeContext = "..." + beforeContext
      highlightedText = highlightTarget
      afterContext = rawText.substring(idx + highlightTarget.length, idx + highlightTarget.length + 80)
      if (idx + highlightTarget.length + 80 < rawText.length) afterContext += "..."
    } else if (highlightTarget) {
      highlightedText = highlightTarget
      afterContext = rawText ? " ... " + rawText.substring(0, 100) + "..." : ""
    } else {
      highlightedText = rawText.substring(0, 140)
      afterContext = rawText.length > 140 ? "..." : ""
    }

    return (
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (onNavigate) {
            onNavigate({ type: 'article', id: article.id, slug: article.slug })
          } else {
            const articleUrl = routes.tenant.article(article.author?.subdomain || "demo", article.slug)
            window.open(articleUrl, "_blank")
          }
        }}
        className="group/quote relative overflow-hidden border border-border/50 hover:border-brand/40 rounded-2xl p-4 bg-muted/20 hover:bg-muted/40 transition-all duration-300 cursor-pointer flex flex-col gap-3 mt-3 shadow-xs font-sans"
      >
        {/* Left Accent Bar */}
        <div className="absolute top-0 left-0 w-1 h-full bg-brand/80 rounded-l-2xl" />

        {/* Card Header: Tenant & Badge */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <FileText className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="font-bold text-foreground truncate">{subdomain}</span>
            <span className="opacity-40">/</span>
            <span className="bg-brand/10 text-brand text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
              Article
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover/quote:text-brand transition-colors shrink-0">
            <span>Ouvrir</span>
            <ArrowUpRight className="w-3 h-3" />
          </div>
        </div>

        {/* Article Title */}
        <h4 className="text-base font-serif font-bold text-foreground leading-snug group-hover/quote:text-brand transition-colors">
          {article.title}
        </h4>

        {/* Excerpt Container with Highlight & Context */}
        <div className="relative bg-card/90 border border-border/40 rounded-xl p-3.5 space-y-1">
          <span className="absolute -top-2 right-3 font-serif text-4xl text-muted-foreground/15 select-none pointer-events-none">“</span>
          <p className="text-xs sm:text-sm font-serif leading-relaxed text-foreground">
            {beforeContext && <span className="text-muted-foreground/75">{beforeContext}</span>}
            <mark className="bg-amber-200/80 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 px-1.5 py-0.5 rounded font-medium shadow-2xs mx-0.5">
              {highlightedText}
            </mark>
            {afterContext && <span className="text-muted-foreground/75">{afterContext}</span>}
          </p>
        </div>

        {/* Footer Credit & Action */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
          <div className="text-muted-foreground">
            Par <span className="font-semibold text-foreground">{authorName}</span>
          </div>

          <div className="flex items-center gap-1 font-bold text-xs text-brand group-hover/quote:translate-x-0.5 transition-transform">
            <span>Lire la suite</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    )
  }

  // 3. Rendu d'un lien externe avec métadonnées OpenGraph (Twitter Card style)
  if (!preview.isInternal && preview.externalMetadata) {
    const meta = preview.externalMetadata

    return (
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group/link flex flex-col sm:flex-row border border-[var(--border-default)] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-0)] hover:bg-[var(--surface-2)] transition-all duration-300 mt-2 select-none"
      >
        {meta.image && (
          <div className="sm:w-32 aspect-video sm:aspect-square shrink-0 overflow-hidden border-b sm:border-b-0 sm:border-r border-[var(--border-default)]">
            <img
              src={meta.image}
              alt=""
              className="w-full h-full object-cover group-hover/link:scale-[1.02] transition-transform duration-500"
            />
          </div>
        )}
        <div className="p-3.5 flex flex-col justify-between gap-1.5 min-w-0">
          <div className="space-y-1">
            <h4 className="text-[13px] font-bold text-[var(--text-primary)] leading-snug truncate group-hover/link:text-[var(--qoe-vermillion)] transition-colors">
              {meta.title}
            </h4>
            {meta.description && (
              <p className="text-[11px] text-[var(--text-secondary)] leading-normal line-clamp-2">
                {meta.description}
              </p>
            )}
          </div>
          <span className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1 font-sans">
            {meta.siteName}
            <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
          </span>
        </div>
      </a>
    )
  }

  return null
}
