"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useTranslate } from "@tolgee/react"

interface FeedTabsHeaderProps {
  activeFeed: string
  onTabChange: (id: string) => void
}

export function FeedTabsHeader({ activeFeed, onTabChange }: FeedTabsHeaderProps) {
  const { t } = useTranslate()

  const tabs = [
    { id: "recommandation", label: t("feed.tab_for_you", "Pour vous") },
    { id: "abonnement",     label: t("feed.tab_following", "Abonnements") },
    { id: "decouvrir",      label: t("feed.tab_discover", "Explorer") },
    { id: "bookmarks",      label: t("feed.tab_library", "Bibliothèque") },
  ]

  return (
    <div className="flex items-baseline gap-0">
      {tabs.map(tab => {
        const active = activeFeed === tab.id

        return (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "relative px-3 py-1",
              "text-[13px] font-medium tracking-tight",
              "outline-none cursor-pointer transition-colors duration-200",
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {tab.label}

            {/* Underline indicator */}
            {active && (
              <motion.div
                layoutId="feedTabUnderline"
                transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.6 }}
                className="absolute bottom-0 left-3 right-3 h-[1.5px] rounded-full bg-[var(--qoe-vermillion)]"
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
