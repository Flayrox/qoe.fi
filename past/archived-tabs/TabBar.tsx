"use client"

import React, { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, FileText } from "lucide-react"
import { useTabStore, Tab } from "@/lib/use-tab-store"
import { TimelineIcon, CommentIcon, ProfileIcon } from "@/components/icons/CustomIcons"
import { cn } from "@/lib/utils"

const springs = {
  tab: { type: "spring" as const, stiffness: 480, damping: 34, mass: 0.6 }
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTabId, removeTab } = useTabStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll horizontal au wheel
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [])

  // Auto-scroll vers l'onglet actif
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !activeTabId) return
    const activeEl = el.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
    }
  }, [activeTabId])

  const getIcon = (type: Tab["type"]) => {
    switch (type) {
      case "timeline":
        return <TimelineIcon className="w-3 h-3 text-[var(--text-tertiary)]" />
      case "post":
        return <CommentIcon className="w-3 h-3 text-[var(--qoe-vermillion)]" />
      case "article":
        return <FileText className="w-3 h-3 text-[var(--qoe-vermillion)]" strokeWidth={1.5} />
      case "profile":
        return <ProfileIcon className="w-3 h-3 text-[var(--qoe-vermillion)]" />
    }
  }

  return (
    <div className="relative w-full [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-16px),transparent)] py-0.5">
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center gap-1 px-1 py-1",
          "bg-[var(--surface-2)] border border-[var(--border-subtle)]",
          "rounded-[var(--radius-element)]",
          "overflow-x-auto select-none",
          // Hide scrollbar
          "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          "w-full"
        )}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id

            return (
              <motion.div
                key={tab.id}
                data-tab-id={tab.id}
                layout
                initial={{ opacity: 0, width: 0, scale: 0.85 }}
                animate={{ opacity: 1, width: "auto", scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.85 }}
                transition={springs.tab}
                className={cn(
                  "relative group flex items-center gap-1.5 rounded-[var(--radius-button)]",
                  "text-[11px] font-semibold tracking-tight",
                  "transition-colors duration-200 outline-none cursor-pointer",
                  "whitespace-nowrap shrink-0 overflow-hidden",
                  isActive
                    ? "text-[var(--text-primary)] px-3 py-1.5"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-3 py-1.5"
                )}
                onClick={() => setActiveTabId(tab.id)}
              >
                {/* Active sliding background */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavigationTab"
                    transition={springs.tab}
                    className="absolute inset-0 bg-[var(--surface-0)] rounded-[var(--radius-button)] -z-10 border border-[var(--border-default)]"
                    style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                  />
                )}

                {/* Icon + Label */}
                <span className="flex items-center gap-1.5">
                  {getIcon(tab.type)}
                  <span className="truncate max-w-[120px]">{tab.title}</span>
                </span>

                {/* Close button — Expanded hitbox zone to ensure easy clickability */}
                {tab.id !== "timeline" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTab(tab.id)
                    }}
                    className={cn(
                      "relative z-10 w-8 h-8 -my-2 -mr-2 flex items-center justify-center rounded-[var(--radius-element)] transition-all duration-150 cursor-pointer",
                      "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
                      "hover:bg-[var(--surface-2)]",
                      // Visible on tab hover only
                      "opacity-0 group-hover:opacity-100"
                    )}
                    aria-label={`Fermer l'onglet ${tab.title}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
