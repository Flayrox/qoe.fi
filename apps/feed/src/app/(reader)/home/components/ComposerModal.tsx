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
            {/* Header Bar with Mode Switcher */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/40">
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveMode("thought")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    activeMode === "thought"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-brand" />
                  <span>Pensée</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode("article")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    activeMode === "article"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="w-3.5 h-3.5 text-brand" />
                  <span>Article / Newsletter</span>
                </button>
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

            {/* Mode Content */}
            {activeMode === "thought" ? (
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
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4 font-sans">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h4 className="text-base font-bold text-foreground">Rédiger une publication longue</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Les articles et newsletters sont rédigés dans l'Espace Studio pour vous offrir l'expérience d'écriture enrichie.
                  </p>
                </div>
                <a
                  href={studioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 bg-foreground text-background font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <span>Ouvrir l'Éditeur Studio</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
