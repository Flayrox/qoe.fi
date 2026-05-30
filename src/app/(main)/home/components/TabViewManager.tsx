"use client"

import React, { useRef, useEffect } from "react"
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

export function TabViewManager({ feedProps }: TabViewManagerProps) {
  const { tabs, activeTabId, updateScrollPosition, addTab } = useTabStore()
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
      // requestAnimationFrame guarantees execution immediately before the browser repaints
      const frameId = requestAnimationFrame(() => {
        container.scrollTop = activeTab.scrollPosition
      })
      return () => cancelAnimationFrame(frameId)
    }
  }, [activeTabId, tabs])

  const isReadingContent = ["article", "post"].includes(
    tabs.find(t => t.id === activeTabId)?.type || ""
  )

  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-48px)]">
      {/* Reading Progress Bar — article/post tabs only */}
      <ReadingProgressBar active={isReadingContent} containerRef={scrollContainerRef as React.RefObject<HTMLElement>} />

      {/* Sliding Browser-like Tab bar */}
      <TabBar />

      {/* Main scrolling viewport */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pr-0.5 h-full"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-3) transparent" }}
      >
        {/* Core timeline is kept in DOM but hidden to conserve scroll & state */}
        <div className={activeTabId === "timeline" ? "block" : "hidden"}>
          <TabErrorBoundary tabId="timeline">
            <FeedDashboard {...feedProps} />
          </TabErrorBoundary>
        </div>

        {/* Render dynamically open article readers or social threads */}
        {tabs.map((tab) => {
          if (tab.id === "timeline") return null
          const isActive = activeTabId === tab.id
          
          return (
            <div key={tab.id} className={isActive ? "block animate-fadeIn" : "hidden"}>
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
          )
        })}
      </div>
    </div>
  )
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="24 12" strokeLinecap="round" />
    </svg>
  )
}
