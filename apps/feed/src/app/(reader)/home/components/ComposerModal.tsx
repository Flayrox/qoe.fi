import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Sparkles, MessageSquare, FileText, ExternalLink } from "lucide-react"
import { ThoughtComposer } from "./ThoughtComposer"
import { cn } from "@qoe/utils"
import { routes } from "@qoe/config/routes"

interface ComposerModalProps {
  isOpen: boolean
  onClose: () => void
  dbUser: any
  tagsList: string[]
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
  tagsList,
  quotedThought = null,
  replyToThought = null,
  initialMode = "thought",
  onPostCreated,
  onLoginRequired,
}: ComposerModalProps) {
  const [activeMode, setActiveMode] = useState<"thought" | "article">(initialMode)

  useEffect(() => {
    setActiveMode(initialMode)
  }, [initialMode, isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  const studioUrl = process.env.NEXT_PUBLIC_STUDIO_URL || "http://localhost:3020/dashboard/articles/new"

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop — Light gaussian blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Dialog Sheet */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "relative z-10 w-full max-w-xl p-6 rounded-2xl shadow-2xl overflow-hidden",
              "bg-card border border-border/60 text-card-foreground"
            )}
          >
            {/* Header Bar */}
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
              replyToThought={replyToThought}
              onPostCreated={(post) => {
                if (onPostCreated) onPostCreated(post)
                onClose()
              }}
              onLoginRequired={() => {
                onClose()
                if (onLoginRequired) onLoginRequired()
              }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
