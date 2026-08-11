"use client"

import React, { useState, useEffect } from "react"
import { Globe, Loader2, ArrowUpRight } from "lucide-react"
import { cn } from "@qoe/utils"
import { QuotedArticleCard, type QuotedArticleData } from "./QuotedArticleCard"
import { QuotedThoughtCard, type QuotedThoughtData } from "./QuotedThoughtCard"

export interface LinkPreviewProps {
  urls: string[]
  quotedExcerpt?: string
  onNavigate?: (target: { type: "post" | "article" | "profile"; id: string; slug?: string }) => void
  unfurlFn?: (url: string) => Promise<any>
  className?: string
}

export function LinkPreview({ urls, quotedExcerpt, onNavigate, unfurlFn, className }: LinkPreviewProps) {
  const [preview, setPreview] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const urlsKey = urls.join(",")

  useEffect(() => {
    let active = true

    async function fetchFirstValidPreview() {
      if (urls.length === 0) return
      setLoading(true)

      try {
        if (unfurlFn) {
          for (const url of urls) {
            if (!active) break
            const previewData = await unfurlFn(url)

            if (previewData) {
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
  }, [urlsKey, unfurlFn])

  if (loading) {
    return (
      <div className={cn("border border-border/40 rounded-xl p-3.5 flex items-center justify-center gap-2.5 bg-muted/20 font-sans text-xs text-muted-foreground mt-2", className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
        <span className="text-[11px] uppercase tracking-wider font-medium">Chargement de l'aperçu...</span>
      </div>
    )
  }

  if (!preview) return null

  // 1. Internal Quoted Post
  if (preview.isInternal && preview.postType === "post") {
    const post = preview.data as QuotedThoughtData
    return (
      <QuotedThoughtCard
        post={post}
        onOpenPost={(id) => {
          if (onNavigate) onNavigate({ type: "post", id })
        }}
        className={className}
      />
    )
  }

  // 2. Internal Quoted Article (Apple Reader Highlight Format)
  if (preview.isInternal && preview.postType === "article") {
    const article = preview.data as QuotedArticleData
    return (
      <QuotedArticleCard
        article={article}
        quotedExcerpt={quotedExcerpt}
        onOpenArticle={(art) => {
          if (onNavigate) {
            onNavigate({ type: "article", id: art.id, slug: art.slug })
          } else {
            const url = art.author?.subdomain
              ? `https://${art.author.subdomain}.qoe.fi/article/${art.slug}`
              : `/article/${art.slug}`
            window.open(url, "_blank")
          }
        }}
        className={className}
      />
    )
  }

  // 3. External OpenGraph Link Preview
  if (!preview.isInternal && preview.externalMetadata) {
    const meta = preview.externalMetadata

    return (
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "group/link flex flex-col sm:flex-row border border-border/40 rounded-xl overflow-hidden bg-card hover:bg-muted/30 transition-all duration-300 mt-2 select-none font-sans shadow-2xs",
          className
        )}
      >
        {meta.image && (
          <div className="sm:w-32 aspect-video sm:aspect-square shrink-0 overflow-hidden border-b sm:border-b-0 sm:border-r border-border/40">
            <img
              src={meta.image}
              alt=""
              className="w-full h-full object-cover group-hover/link:scale-[1.02] transition-transform duration-500"
            />
          </div>
        )}
        <div className="p-3.5 flex flex-col justify-between gap-1.5 min-w-0">
          <div className="space-y-1">
            <h4 className="text-xs sm:text-sm font-bold text-foreground leading-snug truncate group-hover/link:text-brand transition-colors">
              {meta.title}
            </h4>
            {meta.description && (
              <p className="text-xs text-muted-foreground leading-normal line-clamp-2">
                {meta.description}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 font-medium pt-1">
            {meta.siteName || new URL(meta.url || "https://qoe.fi").hostname}
            <ArrowUpRight className="w-3 h-3 opacity-70" />
          </span>
        </div>
      </a>
    )
  }

  return null
}
