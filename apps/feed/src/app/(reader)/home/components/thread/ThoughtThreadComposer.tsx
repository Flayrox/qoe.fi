"use client"

import React, { useState } from "react"
import { Send, Loader2 } from "lucide-react"
import { useThoughtThreadContext } from "./ThoughtThreadContext"

export interface ThoughtThreadComposerProps {
  placeholder?: string
  parentId?: string
}

export function ThoughtThreadComposer({ placeholder = "Votre réponse...", parentId }: ThoughtThreadComposerProps) {
  const { post, currentUserId, submitReply, sendingReply, onLoginRequired } = useThoughtThreadContext()
  const [replyText, setReplyText] = useState("")

  const targetParentId = parentId || post?.id

  if (!targetParentId) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      if (onLoginRequired) onLoginRequired()
      return
    }

    if (!replyText.trim() || sendingReply) return

    const textToSubmit = replyText
    setReplyText("") // Clear input instantly for 0ms UX feel

    const success = await submitReply(targetParentId, textToSubmit)
    if (!success) {
      setReplyText(textToSubmit) // Restore text on error
    }
  }

  return (
    <form onSubmit={handleSubmit} className="py-3 border-b border-border/40 font-sans">
      <div className="flex items-center gap-2.5 bg-muted/30 border border-border/40 rounded-xl p-2 focus-within:border-brand transition-colors">
        <textarea
          rows={1}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none border-none outline-none font-sans px-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
        />

        <button
          type="submit"
          disabled={!replyText.trim() || sendingReply}
          className="p-2 rounded-lg bg-brand text-background hover:opacity-90 disabled:opacity-40 transition-all cursor-pointer shrink-0"
        >
          {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </form>
  )
}
