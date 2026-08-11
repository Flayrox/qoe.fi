"use client"

import React from "react"
import { cn } from "@qoe/utils"
import { TextParser } from "../ui/TextParser"

export interface ThoughtBodyProps {
  content?: string | null
  imageUrl?: string | null
  attachments?: Array<{ url: string; type?: string; altText?: string | null }> | null
  triggerWarning?: string | null
  isFocus?: boolean
  onOpenMedia?: (url: string) => void
  className?: string
}

const getImages = (
  imageUrl: string | null | undefined,
  attachments?: Array<{ url: string; type?: string; altText?: string | null }> | null
): Array<{ url: string; type: string; altText: string | null }> => {
  if (attachments && attachments.length > 0) {
    return attachments.map((a) => ({
      url: a.url,
      type: a.type || "IMAGE",
      altText: a.altText || null,
    }))
  }
  if (!imageUrl) return []
  if (imageUrl.startsWith("[")) {
    try {
      const parsed: string[] = JSON.parse(imageUrl)
      return parsed.map((url) => ({ url, type: "IMAGE", altText: null }))
    } catch {
      return [{ url: imageUrl, type: "IMAGE", altText: null }]
    }
  }
  return [{ url: imageUrl, type: "IMAGE", altText: null }]
}

const cleanThoughtContent = (text: string | null | undefined): string => {
  if (!text) return ""
  return text.trim()
}

export function ThoughtBody({
  content,
  imageUrl,
  attachments,
  triggerWarning,
  isFocus = false,
  onOpenMedia,
  className,
}: ThoughtBodyProps) {
  const [isRevealed, setIsRevealed] = React.useState<boolean>(false)

  const cleanedText = cleanThoughtContent(content || "")
  const items = getImages(imageUrl, attachments)
  const hasWarning = !!triggerWarning && !isRevealed

  if (!cleanedText && items.length === 0) return null

  return (
    <div className={cn("relative space-y-2 font-sans", className)}>
      <div className={cn("transition-all duration-300", hasWarning && "blur-md pointer-events-none select-none")}>
        {cleanedText && (
          <div
            className={cn(
              "text-foreground/90 leading-relaxed font-sans pt-0.5",
              isFocus ? "text-sm sm:text-base py-0.5 font-normal" : "text-xs sm:text-sm"
            )}
          >
            <TextParser content={cleanedText} />
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden cursor-pointer mt-2">
            <ImageGrid items={items} onOpenMedia={onOpenMedia} />
          </div>
        )}
      </div>

      {hasWarning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/80 backdrop-blur-md transition-all duration-300 p-4 rounded-xl border border-border/40 z-20">
          <span className="text-[10px] uppercase tracking-wider text-amber-500 mb-1.5 font-bold">
            Avertissement de contenu
          </span>
          <p className="text-xs font-medium text-foreground text-center max-w-[280px] mb-3 leading-snug">
            {triggerWarning}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsRevealed(true)
            }}
            className="px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 text-[10px] font-bold rounded-lg transition-all cursor-pointer shadow-xs uppercase tracking-wider"
          >
            Afficher
          </button>
        </div>
      )}
    </div>
  )
}

function ImageGrid({
  items,
  onOpenMedia,
}: {
  items: Array<{ url: string; type: string; altText: string | null }>
  onOpenMedia?: (url: string) => void
}) {
  const [activeAlt, setActiveAlt] = React.useState<string | null>(null)

  if (items.length === 0) return null

  const gridColsClass =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
      ? "grid-cols-2"
      : items.length === 3
      ? "grid-cols-2"
      : "grid-cols-2"

  return (
    <div className="space-y-1">
      {activeAlt && (
        <div className="p-2.5 bg-card/95 backdrop-blur-md border border-border text-xs text-foreground rounded-lg flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground"><strong className="text-foreground">ALT :</strong> {activeAlt}</p>
          <button onClick={() => setActiveAlt(null)} className="text-xs text-muted-foreground hover:text-foreground font-bold">✕</button>
        </div>
      )}

      <div className={cn("grid gap-1.5 overflow-hidden rounded-xl", gridColsClass)}>
        {items.map((item, idx) => (
          <div
            key={item.url + idx}
            onClick={(e) => {
              if (onOpenMedia) {
                e.preventDefault()
                e.stopPropagation()
                onOpenMedia(item.url)
              }
            }}
            className="relative overflow-hidden bg-card border border-border/40 shadow-2xs rounded-xl group/img aspect-video"
          >
            <img
              src={item.url}
              alt={item.altText || ""}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-[1.02]"
            />
            {item.altText && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setActiveAlt(activeAlt === item.altText ? null : item.altText)
                }}
                className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 text-[10px] font-bold text-white bg-black/75 backdrop-blur-xs rounded border border-white/20 hover:bg-black/95 transition-colors"
              >
                ALT
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

