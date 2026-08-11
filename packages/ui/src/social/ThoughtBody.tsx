"use client"

import React from "react"
import { cn } from "@qoe/utils"
import { TextParser } from "../ui/TextParser"

export interface ThoughtBodyProps {
  content?: string | null
  imageUrl?: string | null
  triggerWarning?: string | null
  isFocus?: boolean
  onOpenMedia?: (url: string) => void
  className?: string
}

const getImages = (url: string | null | undefined): string[] => {
  if (!url) return []
  if (url.startsWith("[")) {
    try {
      return JSON.parse(url)
    } catch {
      return [url]
    }
  }
  return [url]
}

const cleanThoughtContent = (text: string | null | undefined): string => {
  if (!text) return ""
  return text.trim()
}

export function ThoughtBody({
  content,
  imageUrl,
  triggerWarning,
  isFocus = false,
  onOpenMedia,
  className,
}: ThoughtBodyProps) {
  const [isRevealed, setIsRevealed] = React.useState<boolean>(false)

  const cleanedText = cleanThoughtContent(content || "")
  const images = getImages(imageUrl)
  const hasWarning = !!triggerWarning && !isRevealed

  if (!cleanedText && images.length === 0) return null

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

        {images.length > 0 && (
          <div className="overflow-hidden cursor-pointer mt-2">
            <ImageGrid urls={images} onOpenMedia={onOpenMedia} />
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
  urls,
  onOpenMedia,
}: {
  urls: string[]
  onOpenMedia?: (url: string) => void
}) {
  if (urls.length === 0) return null

  return (
    <div
      className={cn(
        "grid gap-2 overflow-hidden rounded-xl",
        urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
      )}
    >
      {urls.map((url) => (
        <div
          key={url}
          onClick={(e) => {
            if (onOpenMedia) {
              e.preventDefault()
              e.stopPropagation()
              onOpenMedia(url)
            }
          }}
          className="relative overflow-hidden bg-card border border-border/40 shadow-2xs rounded-xl group/img"
        >
          <div className="relative overflow-hidden aspect-video rounded-lg">
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover transition-transform duration-700 ease-[0.16,1,0.3,1] group-hover/img:scale-[1.02]"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
