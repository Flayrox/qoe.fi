"use client"

import React, { useState, useEffect } from "react"
import { Sparkles, X } from "lucide-react"
import { Dialog, DialogContent } from "@qoe/ui"
import { ThoughtComposer } from "./ThoughtComposer"
import { ThoughtReplyModal } from "./ThoughtReplyModal"

interface ComposerModalProps {
  isOpen: boolean
  onClose: () => void
  dbUser: any
  tagsList?: string[]
  quotedThought?: any
  replyToThought?: any
  initialMode?: "thought" | "article"
  onPostCreated?: (post: any) => void
  onLoginRequired?: () => void
}

export function ComposerModal({
  isOpen,
  onClose,
  dbUser,
  tagsList = [],
  quotedThought = null,
  replyToThought = null,
  initialMode = "thought",
  onPostCreated,
  onLoginRequired,
}: ComposerModalProps) {
  // If replying to a specific thought, render dedicated Twitter/Bluesky-style ThoughtReplyModal
  if (replyToThought) {
    return (
      <ThoughtReplyModal
        isOpen={isOpen}
        onClose={onClose}
        parentThought={replyToThought}
        dbUser={dbUser}
        tagsList={tagsList}
        onReplyCreated={onPostCreated}
        onLoginRequired={onLoginRequired}
      />
    )
  }

  // Regular New Post Modal (Centered Dialog on Desktop, Bottom Sheet on Mobile)
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-xl p-5 bg-card border border-border/60 text-card-foreground rounded-2xl shadow-2xl overflow-hidden font-sans"
      >
        {/* Modal Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" />
            <span className="text-xs font-bold text-foreground">Nouvelle publication</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-sans">
              ⌘K / ⌘N
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Unified Core Composer */}
        <ThoughtComposer
          dbUser={dbUser}
          tagsList={tagsList}
          quotedThought={quotedThought}
          onPostCreated={(post) => {
            if (onPostCreated) onPostCreated(post)
            onClose()
          }}
          onLoginRequired={() => {
            onClose()
            if (onLoginRequired) onLoginRequired()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
