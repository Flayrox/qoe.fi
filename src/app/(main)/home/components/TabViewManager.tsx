"use client"

import React, { useRef, useEffect } from "react"
import { motion, AnimatePresence, useDragControls } from "framer-motion"
import { useTabStore } from "@/lib/use-tab-store"
import { FeedDashboard } from "../FeedDashboard"
import { TabBar } from "./TabBar"
import { ExpandedPostView } from "./ExpandedPostView"
import { ArticleReaderView } from "./ArticleReaderView"
import { ProfileTabReader } from "./ProfileTabReader"
import { cn } from "@/lib/utils"
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary"
import { ReadingProgressBar } from "@/components/ui/ReadingProgressBar"

interface TabViewManagerProps {
  feedProps: any
}

// Snappy spring config matching Rauno's motion principles
const springs = {
  sheet: { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.8 },
  backLayer: { type: "spring" as const, stiffness: 350, damping: 28, mass: 0.8 }
}

export function TabViewManager({ feedProps }: TabViewManagerProps) {
  const { tabs, activeTabId, setActiveTabId, updateScrollPosition, addTab } = useTabStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Hydrate active tab from URL query params on mount (Feature 14)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialTabId = params.get("tab")
    if (initialTabId && initialTabId !== "timeline") {
      if (initialTabId.startsWith("profile-")) {
        const username = initialTabId.replace("profile-", "")
        addTab({ id: initialTabId, title: `@${username}`, type: "profile" })
      } else if (initialTabId.startsWith("article-")) {
        const slug = initialTabId.replace("article-", "")
        addTab({ id: initialTabId, title: "Article", type: "article" })
      } else if (initialTabId.startsWith("post-")) {
        addTab({ id: initialTabId, title: "Post", type: "post" })
      }
    }
  }, [addTab])

  // Synchronize URL query params with the active tab (Feature 14)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (activeTabId === "timeline") {
      url.searchParams.delete("tab")
    } else {
      url.searchParams.set("tab", activeTabId)
    }
    window.history.pushState({}, "", url.toString())
  }, [activeTabId])

  // Record scroll position whenever the container is scrolled
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      updateScrollPosition(activeTabId, container.scrollTop)
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [activeTabId, updateScrollPosition])

  // Restore scroll position instantly when switching active tabs
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab) {
      const frameId = requestAnimationFrame(() => {
        container.scrollTop = activeTab.scrollPosition
      })
      return () => cancelAnimationFrame(frameId)
    }
  }, [activeTabId, tabs])

  const isReadingContent = ["article", "post"].includes(
    tabs.find(t => t.id === activeTabId)?.type || ""
  )

  const activeTab = tabs.find(t => t.id === activeTabId)

  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-48px)] relative overflow-hidden">
      {/* Reading Progress Bar — article/post tabs only */}
      <ReadingProgressBar active={isReadingContent} containerRef={scrollContainerRef as React.RefObject<HTMLElement>} />

      {/* Sliding Browser-like Tab bar */}
      <TabBar />

      {/* Main scrolling viewport area styled as gray backdrop desktop screen */}
      <div className="flex-1 relative overflow-hidden bg-[var(--surface-1)] rounded-md border border-[var(--border-subtle)]">
        {/* Core timeline is kept in DOM but scaled/translated/blurred in background */}
        <motion.div
          ref={scrollContainerRef}
          animate={{
            scale: activeTabId === "timeline" ? 1 : 0.96,
            y: activeTabId === "timeline" ? 0 : 20,
            opacity: activeTabId === "timeline" ? 1 : 0.45,
            filter: activeTabId === "timeline" ? "blur(0px)" : "blur(1.5px)",
            borderRadius: activeTabId === "timeline" ? "0px" : "12px",
          }}
          transition={springs.backLayer}
          className={cn(
            "w-full h-full overflow-y-auto pr-0.5 origin-top",
            activeTabId === "timeline" ? "" : "pointer-events-none select-none"
          )}
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-3) transparent" }}
        >
          <TabErrorBoundary tabId="timeline">
            <FeedDashboard {...feedProps} />
          </TabErrorBoundary>
        </motion.div>

        {/* Render active tab as iOS stacked sheets with drag to dismiss */}
        <AnimatePresence mode="wait">
          {activeTab && activeTab.id !== "timeline" && (
            <StackedReaderSheet
              key={activeTab.id}
              tab={activeTab}
              feedProps={feedProps}
              onClose={() => setActiveTabId("timeline")}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StackedReaderSheet({
  tab,
  feedProps,
  onClose
}: {
  tab: any
  feedProps: any
  onClose: () => void
}) {
  const dragControls = useDragControls()

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={springs.sheet}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0 }}
      dragElastic={0.35}
      onDragEnd={(event, info) => {
        // Drag down enough to dismiss
        if (info.offset.y > 140 || info.velocity.y > 600) {
          onClose()
        }
      }}
      className="absolute inset-x-0 bottom-0 top-[2px] z-50 flex flex-col bg-white rounded-t-[16px] shadow-[0_-10px_35px_rgba(0,0,0,0.08)] border-t border-[var(--border-subtle)] overflow-hidden"
    >
      {/* Drag Handle with Rauno Vibe */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="w-full py-4 flex justify-center items-center bg-white border-b border-neutral-100/50 cursor-ns-resize shrink-0 relative select-none"
      >
        <div className="w-10 h-1 bg-neutral-200/85 rounded-full" />
        <button
          onClick={onClose}
          className="absolute right-6 text-[10px] font-bold text-neutral-400 hover:text-[var(--qoe-vermillion)] transition-colors uppercase tracking-wider outline-none cursor-pointer"
        >
          Fermer
        </button>
      </div>

      {/* Reader scrollable sheet viewport */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white custom-scrollbar">
        <TabErrorBoundary tabId={tab.id}>
          {tab.type === "post" && (
            <ExpandedPostView postId={tab.id.replace("post-", "")} currentUserId={feedProps.dbUser?.id || null} />
          )}
          {tab.type === "article" && (
            <ArticleReaderView slug={tab.id.replace("article-", "")} />
          )}
          {tab.type === "profile" && (
            <ProfileTabReader username={tab.id.replace("profile-", "")} currentUserId={feedProps.dbUser?.id || null} />
          )}
        </TabErrorBoundary>
      </div>
    </motion.div>
  )
}

