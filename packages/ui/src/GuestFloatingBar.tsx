"use client"

import React from "react"
import { Bookmark, UserPlus, LogIn } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@qoe/utils"

export type AuthActionContext = "like" | "follow" | "bookmark" | "comment" | "repost"

interface GuestFloatingBarProps {
  onOpenAuth: (options: { mode: "login" | "signup"; actionContext?: AuthActionContext }) => void
  labels?: {
    bookmarkTooltip?: string
    signupBtn?: string
    loginBtn?: string
  }
}

export function GuestFloatingBar({ onOpenAuth, labels }: GuestFloatingBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card/90 dark:bg-zinc-900/90 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl p-2.5 flex items-center gap-3 transition-all duration-300 pointer-events-auto select-none max-w-[90%] sm:max-w-md"
    >
      {/* Bookmark Action Trigger */}
      <button
        onClick={() => onOpenAuth({ mode: "signup", actionContext: "bookmark" })}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground"
        title={labels?.bookmarkTooltip || "Enregistrer dans le sanctuaire"}
      >
        <Bookmark className="w-5 h-5" />
      </button>

      <div className="w-px h-5 bg-border/60" />

      {/* Main Signup Vermilion Action */}
      <button
        onClick={() => onOpenAuth({ mode: "signup", actionContext: "follow" })}
        className={cn(
          "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
          "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
        )}
      >
        <UserPlus className="w-3.5 h-3.5" />
        <span>{labels?.signupBtn || "Rejoindre qoe.fi"}</span>
      </button>

      <div className="w-px h-5 bg-border/60" />

      {/* Login Action */}
      <button
        onClick={() => onOpenAuth({ mode: "login" })}
        className="px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-1.5 cursor-pointer"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>{labels?.loginBtn || "Connexion"}</span>
      </button>
    </motion.div>
  )
}
