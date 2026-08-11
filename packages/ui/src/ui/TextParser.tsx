"use client"

import React from "react"
import { cn } from "@qoe/utils"
import { ProfileHoverCard } from "../social/ProfileHoverCard"

interface TextParserProps {
  content: string
  className?: string
  onMentionClick?: (username: string) => void
}

export function TextParser({ content, className, onMentionClick }: TextParserProps) {
  if (!content) return null

  // Split by mentions and hashtags, keeping the matched string in the array
  const parts = content.split(/(@[a-zA-Z0-9_.-]+|#[a-zA-Z0-9_-]+)/g)

  return (
    <p className={cn("whitespace-pre-line", className)}>
      {parts.map((part, i) => {
        if (part.startsWith("@") && part.length > 1) {
          const username = part.slice(1)

          return (
            <ProfileHoverCard key={i} username={username} onOpenProfile={onMentionClick}>
              <span className="text-brand font-normal hover:underline cursor-pointer">
                {part}
              </span>
            </ProfileHoverCard>
          )
        }
        
        if (part.startsWith("#") && part.length > 1) {
          return (
            <span key={i} className="text-brand/80 font-medium hover:underline cursor-pointer">
              {part}
            </span>
          )
        }
        
        return <span key={i}>{part}</span>
      })}
    </p>
  )
}
