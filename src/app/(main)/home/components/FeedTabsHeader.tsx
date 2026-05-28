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
    <div className="sticky top-0 z-40 py-4 bg-[#FAFAFA]/80 backdrop-blur-2xl border-b-[0.5px] border-neutral-200/50 flex items-center justify-between transition-all duration-300 -mx-4 px-4 sm:-mx-6 sm:px-6 mb-2">
      <div className="flex items-center gap-1 p-1 bg-neutral-200/30 backdrop-blur-md rounded-[20px] shadow-inner">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative px-5 py-2.5 rounded-[16px] text-[13px] font-bold tracking-tight transition-all duration-300 flex items-center justify-center outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#EE4B2B]/30"
          >
            {activeFeed === tab.id && (
              <motion.div
                layoutId="activeFeedTab"
                transition={springs.tab}
                className="absolute inset-0 bg-white rounded-[16px] shadow-sm border-[0.5px] border-neutral-200/50"
              />
            )}
            <span className={cn(
              "relative z-10 transition-colors duration-300", 
              activeFeed === tab.id ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            )}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      
      <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-[0.1em] px-3 py-1.5">
        {totalCount} pubs
      </span>
    </div>
  )
}
