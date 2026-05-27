"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, FileText } from "lucide-react"
import { useTabStore, Tab } from "@/lib/use-tab-store"
import { TimelineIcon, CommentIcon } from "@/components/icons/CustomIcons"
import { cn } from "@/lib/utils"

const springs = {
  tab: { type: "spring" as const, stiffness: 450, damping: 32, mass: 0.7 }
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTabId, removeTab } = useTabStore()

  const getIcon = (type: Tab["type"]) => {
    switch (type) {
      case "timeline":
        return <TimelineIcon className="w-3.5 h-3.5" />
      case "post":
        return <CommentIcon className="w-3.5 h-3.5 text-[#EE4B2B]" />
      case "article":
        return <FileText className="w-3.5 h-3.5 text-[#EE4B2B]" />
    }
  }

  return (
    <div className="flex items-center gap-1.5 p-1 bg-neutral-200/35 border border-black/[0.03] rounded-xl overflow-x-auto select-none custom-scrollbar w-full">
      <AnimatePresence mode="popLayout">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id
          
          return (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, scale: 0.9, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 10 }}
              transition={springs.tab}
              className={cn(
                "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-colors duration-200 outline-none cursor-pointer",
                isActive ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-800"
              )}
              onClick={() => setActiveTabId(tab.id)}
            >
              {/* Sliding Active Background */}
              {isActive && (
                <motion.div
                  layoutId="activeNavigationTab"
                  transition={springs.tab}
                  className="absolute inset-0 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.01] rounded-lg -z-10"
                />
              )}

              <span className="relative z-10 flex items-center gap-2">
                {getIcon(tab.type)}
                <span className="truncate max-w-[120px]">{tab.title}</span>
              </span>

              {/* Close Button (Timeline is protected and cannot be closed) */}
              {tab.id !== "timeline" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTab(tab.id)
                  }}
                  className="relative z-10 p-0.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
