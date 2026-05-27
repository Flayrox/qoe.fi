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
    <div className="sticky top-0 z-40 py-2.5 bg-[#FAFAFA]/80 backdrop-blur-xl border-b border-neutral-200/40 flex items-center justify-between">
      <div className="flex items-center gap-1 p-1 bg-white border border-neutral-200/50 rounded-xl shadow-xs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-colors duration-200 flex items-center justify-center gap-1.5 outline-none cursor-pointer"
          >
            {activeFeed === tab.id && (
              <motion.div
                layoutId="activeFeedTab"
                transition={springs.tab}
                className="absolute inset-0 bg-neutral-50 border border-neutral-200/60 rounded-lg shadow-xs"
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
      
      <span className="text-[10px] font-mono text-neutral-400 font-semibold px-2.5 py-1 bg-white rounded-lg border border-neutral-200/40">
        {totalCount} publications
      </span>
    </div>
  )
}
