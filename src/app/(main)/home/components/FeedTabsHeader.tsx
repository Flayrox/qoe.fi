"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface FeedTabsHeaderProps {
  activeFeed: string
  onTabChange: (id: string) => void
  totalCount: number
}

const springs = {
  tab: { type: "spring" as const, stiffness: 450, damping: 32, mass: 0.7 }
}

export function FeedTabsHeader({ activeFeed, onTabChange, totalCount }: FeedTabsHeaderProps) {
  const tabs = [
    { id: "recommandation", label: "Recommandation" },
    { id: "abonnement", label: "Abonnement" },
    { id: "decouvrir", label: "Découvrir" }
  ]

  return (
    <div className="sticky top-0 z-40 py-3 bg-[#FAFAFA]/90 backdrop-blur-xl border-b border-neutral-200/40 flex items-center justify-between transition-all duration-300">
      <div className="flex items-center gap-1.5 p-1 bg-white border border-neutral-200/60 rounded-2xl shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative px-4 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 flex items-center justify-center gap-1.5 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30"
          >
            {activeFeed === tab.id && (
              <motion.div
                layoutId="activeFeedTab"
                transition={springs.tab}
                className="absolute inset-0 bg-neutral-50 border border-neutral-200/45 rounded-xl shadow-xs"
              />
            )}
            <span className={cn(
              "relative z-10 transition-colors duration-300", 
              activeFeed === tab.id ? "text-[#EE4B2B] font-bold" : "text-neutral-500 hover:text-neutral-800"
            )}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      
      <span className="text-[10px] font-mono text-neutral-400 font-semibold px-3 py-1.5 bg-white rounded-xl border border-neutral-200/55 shadow-xs">
        {totalCount} publications
      </span>
    </div>
  )
}
