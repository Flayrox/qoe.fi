"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Users, Compass, BookMarked, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface FeedTabsHeaderProps {
  activeFeed: string
  onTabChange: (id: string) => void
  totalCount: number
}

const springs = {
  indicator: { type: "spring" as const, stiffness: 500, damping: 36, mass: 0.6 },
}

const tabs = [
  { id: "recommandation", label: "Pour vous",    icon: Sparkles   },
  { id: "abonnement",     label: "Abonnements",  icon: Users      },
  { id: "decouvrir",      label: "Explorer",     icon: Compass    },
  { id: "bookmarks",      label: "Bibliothèque", icon: BookMarked },
]

export function FeedTabsHeader({ activeFeed, onTabChange, totalCount }: FeedTabsHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6",
        "bg-[var(--surface-1)]/85 backdrop-blur-2xl",
        "border-b border-[var(--border-subtle)]",
        "flex items-center justify-between",
        "transition-all duration-300"
      )}
    >
      {/* Tabs row */}
      <div className="flex items-end gap-0">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeFeed === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-4 py-3.5",
                "text-[12px] font-semibold tracking-tight",
                "outline-none cursor-pointer transition-colors duration-200",
                "focus-visible:ring-1 focus-visible:ring-[var(--qoe-vermillion)]/30 rounded-t-lg",
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-colors duration-200",
                  active ? "text-[var(--qoe-vermillion)]" : "text-current"
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span>{tab.label}</span>

              {/* Underline indicator — Linear-style */}
              {active && (
                <motion.div
                  layoutId="feedTabIndicator"
                  transition={springs.indicator}
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--qoe-vermillion)]"
                  style={{ boxShadow: "0 0 8px var(--qoe-vermillion-glow)" }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Right : Count badge + Filters */}
      <div className="flex items-center gap-2 py-3">
        {/* Dynamic count badge */}
        <AnimatePresence mode="wait">
          <motion.span
            key={totalCount}
            initial={{ opacity: 0, y: -4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "text-[10px] font-bold font-mono px-2 py-0.5 rounded-full tabular-nums",
              totalCount > 0
                ? "bg-[var(--surface-2)] text-[var(--text-tertiary)]"
                : "text-[var(--text-quaternary)]"
            )}
          >
            {totalCount > 0 ? totalCount : "∅"}
          </motion.span>
        </AnimatePresence>

        {/* Filters button */}
        <button
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-button)]",
            "text-[10px] font-semibold text-[var(--text-tertiary)]",
            "hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]",
            "border border-transparent hover:border-[var(--border-subtle)]",
            "transition-all duration-200 outline-none cursor-pointer"
          )}
          aria-label="Filtres avancés"
        >
          <SlidersHorizontal className="w-3 h-3" strokeWidth={2} />
          <span className="hidden sm:block">Filtres</span>
        </button>
      </div>
    </div>
  )
}
