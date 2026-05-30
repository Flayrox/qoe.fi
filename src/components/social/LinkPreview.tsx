"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Globe, FileText, Loader2, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabStore } from "@/lib/use-tab-store"

interface LinkPreviewProps {
  urls: string[]
}

export function LinkPreview({ urls }: LinkPreviewProps) {
  const [preview, setPreview] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const { addTab } = useTabStore()

  useEffect(() => {
    let active = true

    async function fetchFirstValidPreview() {
      if (urls.length === 0) return
      setLoading(true)

      try {
        const { unfurlUrl } = await import("@/app/(main)/home/actions")

        for (const url of urls) {
          if (!active) break
          const res = await unfurlUrl(url)
          if (res.success && res.data) {
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
  }, [urls])

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
          addTab({
            id: `post-${post.id}`,
            title: authorName,
            type: "post"
          })
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

  // 2. Rendu d'un Article interne (Quoted Article)
  if (preview.isInternal && preview.postType === "article") {
    const article = preview.data
    const authorName = article.author.name || "Auteur"

    return (
      <div
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          addTab({
            id: `article-${article.slug}`,
            title: article.title,
            type: "article",
            slug: article.slug
          })
        }}
        className="group/quote border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 bg-[var(--surface-0)] hover:bg-[var(--surface-2)] transition-all duration-300 cursor-pointer flex flex-col gap-1.5 mt-2"
      >
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--qoe-vermillion)]">
          <FileText className="w-3.5 h-3.5" />
          <span>Article</span>
        </div>
        <h4 className="text-[14px] font-serif font-bold text-[var(--text-primary)] leading-snug group-hover/quote:text-[var(--qoe-vermillion)] transition-colors">
          {article.title}
        </h4>
        <p className="text-[12px] text-[var(--text-tertiary)] font-serif leading-relaxed line-clamp-2">
          {article.content.replace(/<[^>]*>?/gm, "").substring(0, 160)}…
        </p>
        <span className="text-[9px] text-[var(--text-tertiary)] mt-1 block">
          Par {authorName}
        </span>
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
