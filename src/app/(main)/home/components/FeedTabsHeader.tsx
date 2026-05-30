"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Users, Compass, BookMarked, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslate } from "@tolgee/react"

interface FeedTabsHeaderProps {
  activeFeed: string
  onTabChange: (id: string) => void
  totalCount: number
}

const springs = {
  indicator: { type: "spring" as const, stiffness: 500, damping: 36, mass: 0.6 },
}

export function FeedTabsHeader({ activeFeed, onTabChange, totalCount }: FeedTabsHeaderProps) {
  const { t } = useTranslate()
  const [hoveredTab, setHoveredTab] = React.useState<string | null>(null)

  const tabs = [
    { id: "recommandation", label: t("feed.tab_for_you", "Pour vous"),    icon: Sparkles   },
    { id: "abonnement",     label: t("feed.tab_following", "Abonnements"),  icon: Users      },
    { id: "decouvrir",      label: t("feed.tab_discover", "Explorer"),     icon: Compass    },
    { id: "bookmarks",      label: t("feed.tab_library", "Bibliothèque"), icon: BookMarked },
  ]

  return (
    <div
      className={cn(
        "flex items-center justify-between w-full",
        "transition-all duration-355"
      )}
    >
      {/* Tabs row */}
      <div className="flex items-end gap-0">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeFeed === tab.id

          return (
            <motion.button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              whileTap={{ scale: 0.985 }}
              className={cn(
                "relative flex items-center gap-1.5 px-4 py-3.5",
                "text-[12px] font-semibold tracking-tight",
                "outline-none cursor-pointer transition-colors duration-200 z-10",
                "focus-visible:ring-1 focus-visible:ring-[var(--qoe-vermillion)]/30 rounded-t-lg",
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              {/* Warping Hover Pill Background */}
              {hoveredTab === tab.id && (
                <motion.div
                  layoutId="hoverTabIndicator"
                  transition={{ type: "spring", stiffness: 450, damping: 32, mass: 0.8 }}
                  className="absolute inset-x-1 inset-y-1.5 rounded-sm bg-neutral-100/50 -z-10"
                />
              )}

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
            </motion.button>
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
        <motion.button
          whileTap={{ scale: 0.98 }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-button)]",
            "text-[10px] font-semibold text-[var(--text-tertiary)]",
            "hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]",
            "border border-transparent hover:border-[var(--border-subtle)]",
            "transition-all duration-200 outline-none cursor-pointer"
          )}
          aria-label={t("feed.filters_adv", "Filtres avancés")}
        >
          <SlidersHorizontal className="w-3 h-3" strokeWidth={2} />
          <span className="hidden sm:block">{t("feed.filters_btn", "Filtres")}</span>
        </motion.button>
      </div>
    </div>
  )
}
