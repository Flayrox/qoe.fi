"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  BookMarked, Users, Bell, Hash, Sparkles, Compass, AlertCircle
} from "lucide-react"
import { toggleFollowCreatorHome, toggleBookmarkArticleHome } from "./actions"
import { cn } from "@/lib/utils"
import { ArticleCard } from "./components/ArticleCard"
import { MicroPostComposer } from "./components/MicroPostComposer"
import { useTabStore } from "@/lib/use-tab-store"
import { FeedTabsHeader } from "./components/FeedTabsHeader"
import { FeedSidebarWidgets } from "./components/FeedSidebarWidgets"
import { useFeedStore } from "@/lib/use-feed-store"
import { useTranslate } from "@tolgee/react"
import { trackEvent } from "@/lib/analytics"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Author {
  id: string
  name: string | null
  username: string | null
  subdomain: string | null
  customDomain: string | null
  logoUrl: string | null
  heroText: string | null
  isCertified?: boolean
}

interface Article {
  id: string
  title: string
  slug: string
  content: string
  imageUrl?: string | null
  published: boolean
  isPremium: boolean
  readingTime: number
  createdAt: Date | string
  author: Author
  category: { name: string } | null
  tags?: string[]
}

interface FeedDashboardProps {
  dbUser: {
    id: string
    name: string | null
    email: string
    walletBalanceCents: number
    onboardingText: string | null
    role: string
    logoUrl: string | null
    username: string | null
  } | null
  followingArticles: Article[]
  recommendationArticles: Article[]
  discoverArticles: Article[]
  bookmarks: Article[]
  followedCreators: any[]
  suggestedCreators: any[]
  initialFollowsCount: number
  initialBookmarksCount: number
  initialHighlightsCount: number
}

// Snappy engineering springs (instantly responsive)
const springs = {
  tab: { type: "spring" as const, stiffness: 450, damping: 32, mass: 0.7 },
  card: { type: "spring" as const, stiffness: 350, damping: 28 }
}

export function FeedDashboard({
  dbUser,
  followingArticles,
  recommendationArticles,
  discoverArticles,
  bookmarks: initialBookmarks,
  followedCreators: initialFollowedCreators,
  suggestedCreators,
  initialFollowsCount,
  initialBookmarksCount,
  initialHighlightsCount,
}: FeedDashboardProps) {
  const { t } = useTranslate()
  const [activeFeed, setActiveFeed] = useState<string>("recommandation")
  
  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks)
  const [followedCreators, setFollowedCreators] = useState<any[]>(initialFollowedCreators)
  const [followsCount, setFollowsCount] = useState<number>(initialFollowsCount)
  const [bookmarksCount, setBookmarksCount] = useState<number>(initialBookmarksCount)
  
  const { addTab } = useTabStore()

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight
      if (totalHeight > 0) {
        setScrollProgress(window.scrollY / totalHeight)
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])
  
  const localPosts = useFeedStore(state => state.localPosts)
  const deletedPostIds = useFeedStore(state => state.deletedPostIds)
  const interactions = useFeedStore(state => state.interactions)
  const toggleBookmarkOptimistic = useFeedStore(state => state.toggleBookmark)
  
  const [notifications, setNotifications] = useState([
    { id: 1, text: t("feed.notif_mock_1", "Marc Dutronc a publié 'Souveraineté Numérique en Europe'"), time: t("feed.notif_time_1", "Il y a 5 min"), unread: true },
    { id: 2, text: t("feed.notif_mock_2", "Votre note sur 'L'éveil de l'IA' a été synchronisée"), time: t("feed.notif_time_2", "Il y a 2h"), unread: false },
  ])

  const isCreatorFollowed = (creatorId: string) => followedCreators.some(f => f.id === creatorId)
  const isArticleBookmarked = (articleId: string) => {
    const inter = interactions[articleId]
    if (inter?.bookmarked !== undefined) return inter.bookmarked
    return bookmarks.some(b => b.id === articleId)
  }

  const handleFollowToggle = async (creator: any) => {
    // Optimistic Update
    const isCurrentlyFollowed = isCreatorFollowed(creator.id)
    trackEvent("follow_creator_toggled", { creatorId: creator.id, followed: !isCurrentlyFollowed })
    
    if (isCurrentlyFollowed) {
      setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
      setFollowsCount(prev => Math.max(0, prev - 1))
    } else {
      setFollowedCreators(prev => [creator, ...prev])
      setFollowsCount(prev => prev + 1)
    }

    const res = await toggleFollowCreatorHome(creator.id)
    if (!res.success) {
      // Rollback
      if (isCurrentlyFollowed) {
        setFollowedCreators(prev => [creator, ...prev])
        setFollowsCount(prev => prev + 1)
      } else {
        setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
        setFollowsCount(prev => Math.max(0, prev - 1))
      }
    } else if (res.data) {
      // Sync state with server reality
      const actualFollowed = res.data.followed
      if (actualFollowed) {
        setFollowedCreators(prev => prev.some(f => f.id === creator.id) ? prev : [creator, ...prev])
      } else {
        setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
      }
    }
  }

  const handleBookmarkToggle = async (article: Article) => {
    // Optimistic Update
    const isCurrentlyBookmarked = isArticleBookmarked(article.id)
    toggleBookmarkOptimistic(article.id, isCurrentlyBookmarked)
    trackEvent("bookmark_toggled", { articleId: article.id, bookmarked: !isCurrentlyBookmarked })
    
    if (isCurrentlyBookmarked) {
      setBookmarks(prev => prev.filter(b => b.id !== article.id))
      setBookmarksCount(prev => Math.max(0, prev - 1))
    } else {
      setBookmarks(prev => [article, ...prev])
      setBookmarksCount(prev => prev + 1)
    }

    const res = await toggleBookmarkArticleHome(article.id)
    if (!res.success) {
      // Rollback
      toggleBookmarkOptimistic(article.id, !isCurrentlyBookmarked)
      if (isCurrentlyBookmarked) {
        setBookmarks(prev => [article, ...prev])
        setBookmarksCount(prev => prev + 1)
      } else {
        setBookmarks(prev => prev.filter(b => b.id !== article.id))
        setBookmarksCount(prev => Math.max(0, prev - 1))
      }
    } else if (res.data) {
      // Sync state with server reality
      const actualBookmarked = res.data.bookmarked
      useFeedStore.getState().registerInteraction(article.id, { bookmarked: actualBookmarked })
      if (actualBookmarked) {
        setBookmarks(prev => prev.some(b => b.id === article.id) ? prev : [article, ...prev])
      } else {
        setBookmarks(prev => prev.filter(b => b.id !== article.id))
      }
    }
  }

  const currentFeedArticles = useMemo(() => {
    let list: Article[] = []
    if (activeFeed === "recommandation") {
      list = [...localPosts, ...recommendationArticles]
    } else if (activeFeed === "abonnement") {
      list = [...localPosts.filter(p => isCreatorFollowed(p.author.id)), ...followingArticles]
    } else if (activeFeed === "decouvrir") {
      list = discoverArticles
    } else if (activeFeed === "bookmarks") {
      list = bookmarks
    }

    // Filter out deleted posts
    list = list.filter(art => art && art.id && !deletedPostIds.has(art.id))

    // Deduplicate by ID
    const seenIds = new Set<string>()
    list = list.filter(art => {
      if (!art || !art.id) return false
      const idStr = String(art.id)
      if (seenIds.has(idStr)) return false
      seenIds.add(idStr)
      return true
    })

    if (selectedTag) {
      list = list.filter(art => 
        art.title.toLowerCase().includes(selectedTag.toLowerCase()) || 
        art.content.toLowerCase().includes(selectedTag.toLowerCase()) || 
        (art.category && art.category.name.toLowerCase() === selectedTag.toLowerCase())
      )
    }

    return list
  }, [activeFeed, localPosts, recommendationArticles, followingArticles, discoverArticles, bookmarks, selectedTag, followedCreators, deletedPostIds])

  const tagsList = ["#souverainete", "#anti-ia", "#attention", "#philosophie", "#design", "#creators"]

  return (
    <>
      {/* 
        =========================================================================
        GEOMETRIC BACKGROUND: 3 blocks, grid lines, and subtle vermillion aura 
        =========================================================================
      */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-[var(--surface-1)]">
        {/* Subtle Vermillion Aura */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--qoe-vermillion)]/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[var(--qoe-vermillion)]/5 blur-[150px]" />
        <div className="absolute top-[40%] left-[20%] w-[40%] h-[40%] rounded-full bg-white/40 blur-[100px]" />

        {/* Vertical lines framing the central max-w-2xl content (approx 672px) */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-[336px] w-[1px] bg-neutral-200/50" />
        <div className="absolute top-0 bottom-0 left-1/2 translate-x-[336px] w-[1px] bg-neutral-200/50" />

        {/* Horizontal lines cutting the screen into 3 blocks */}
        <div className="absolute top-[25vh] left-0 right-0 h-[1px] bg-neutral-200/50" />
        <div className="absolute top-[65vh] left-0 right-0 h-[1px] bg-neutral-200/50" />
      </div>

      <div className="pb-24 max-w-2xl mx-auto selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)] relative">
        <div className="relative z-10 mt-6">
          {/* ========================================================================= */}
          {/* THE PAPER SHEET: Central column                                           */}
          {/* ========================================================================= */}
          <div className="w-full bg-white border border-[var(--border-subtle)] rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.01),0_10px_35px_rgba(0,0,0,0.02)] overflow-hidden">
            
            {/* Sticky Header inside the sheet containing "Lire." and the Tabs */}
            <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md pt-8 pb-4 px-6 sm:px-8 border-b border-[var(--border-subtle)] transition-all duration-300">
              <div className="flex items-center gap-6 relative w-full">
                {/* Grand titre Lire. */}
                <motion.h1 
                  className="font-serif text-[42px] font-bold text-[var(--qoe-vermillion)] tracking-tight leading-none shrink-0 overflow-hidden"
                  animate={{
                    opacity: scrollProgress > 0.05 ? 0 : 1,
                    y: scrollProgress > 0.05 ? -10 : 0,
                    width: scrollProgress > 0.05 ? 0 : "auto",
                    marginRight: scrollProgress > 0.05 ? 0 : 16
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  style={{ transformOrigin: "left center" }}
                >
                  Lire.
                </motion.h1>

                {/* Tabs */}
                <div className="flex-1 min-w-0">
                  <FeedTabsHeader 
                    activeFeed={activeFeed}
                    onTabChange={(id) => {
                      setActiveFeed(id)
                      setSelectedTag(null)
                      trackEvent("feed_tab_changed", { tab: id })
                    }}
                    totalCount={currentFeedArticles.length}
                  />
                </div>
              </div>
            </div>

            {/* Main content inside the sheet */}
            <div className="p-6 sm:p-8 space-y-6">
              {activeFeed !== "bookmarks" && activeFeed !== "following_creators" && activeFeed !== "notifications" && (
                <MicroPostComposer 
                  dbUser={dbUser}
                  tagsList={tagsList}
                />
              )}

            <div className="space-y-4">

              <AnimatePresence mode="popLayout">
                {activeFeed === "bookmarks" && currentFeedArticles.length === 0 && (
                  <motion.div
                    key="bookmarks-empty"
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={springs.card}
                    className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-12 text-center flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)] shadow-xs"
                  >
                    <BookMarked className="w-8 h-8 text-[var(--text-tertiary)]" />
                    <h4 className="font-bold text-xs text-[var(--text-primary)]">{t("feed.empty_sanctuary", "Votre Sanctuaire est vide")}</h4>
                    <p className="text-[11px] text-[var(--text-tertiary)] max-w-xs leading-relaxed">
                      {t("feed.empty_sanctuary_desc", "Enregistrez des articles en cliquant sur l'icône de signet pour les conserver ici.")}
                    </p>
                  </motion.div>
                )}

                {activeFeed !== "following_creators" && activeFeed !== "notifications" && (
                  currentFeedArticles.length === 0 ? (
                    <motion.div
                      key="empty-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-16 text-center flex flex-col items-center justify-center gap-3"
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <AlertCircle className="w-8 h-8 text-[var(--text-quaternary)]" />
                      <h4 className="font-bold text-xs text-[var(--text-primary)]">{t("feed.no_article_found", "Aucun article trouvé")}</h4>
                      <p className="text-[11px] text-[var(--text-tertiary)] max-w-xs leading-relaxed">
                        {t("feed.no_article_found_desc", "Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Explorer.")}
                      </p>
                    </motion.div>
                  ) : (
                    <div key={`feed-${activeFeed}`} className="space-y-6 relative pl-5 sm:pl-7 ml-2 sm:ml-3">
                      {/* Zen Scroll Line & Vermillion Pearl */}
                      <div className="absolute left-0 top-1 bottom-1 w-[1px] bg-neutral-150/60 pointer-events-none">
                        <motion.div
                          className="absolute left-1/2 -translate-x-[40%] w-1.5 h-1.5 rounded-full bg-[var(--qoe-vermillion)]"
                          style={{ top: `${scrollProgress * 100}%` }}
                          animate={{
                            scale: [1, 1.3, 1],
                            boxShadow: ["0 0 0 0px rgba(238,75,43,0.2)", "0 0 0 4px rgba(238,75,43,0)", "0 0 0 0px rgba(238,75,43,0.2)"]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 3,
                            ease: "easeInOut"
                          }}
                        />
                      </div>
                      {currentFeedArticles.map((article, idx) => {
                        const isBookmarked = isArticleBookmarked(article.id)
                        const isFollowed = isCreatorFollowed(article.author.id)

                        return (
                          <ArticleCard 
                            key={article.id}
                            article={article}
                            idx={idx}
                            dbUser={dbUser}
                            isBookmarked={isBookmarked}
                            isFollowed={isFollowed}
                            handleFollowToggle={handleFollowToggle}
                            handleBookmarkToggle={handleBookmarkToggle}
                            featured={idx === 0 && activeFeed === "recommandation"}
                          />
                        )
                      })}
                    </div>
                  )
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* 
          =========================================================================
          RIGHT COLUMN (MINIMALIST): SVG/logos of recommended creators with hover tooltips
          =========================================================================
        */}
        <TooltipProvider delay={100}>
          <div className="absolute left-[calc(100%+24px)] top-12 hidden xl:flex flex-col gap-4 pointer-events-auto select-none">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--text-tertiary)] [writing-mode:vertical-lr] mb-2 block">
              SUGGESTIONS
            </span>
            <div className="flex flex-col gap-3">
              {suggestedCreators.slice(0, 5).map((creator) => {
                const isFollowed = isCreatorFollowed(creator.id)
                return (
                  <Tooltip key={creator.id}>
                    <TooltipTrigger
                      render={
                        <motion.button
                          onClick={() => addTab({
                            id: `profile-${creator.username || creator.subdomain}`,
                            title: creator.name || `@${creator.username || creator.subdomain}`,
                            type: "profile",
                            username: creator.username || creator.subdomain || ""
                          })}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.95 }}
                          className="w-8 h-8 rounded-sm overflow-hidden border border-[var(--border-default)] bg-white hover:border-[var(--qoe-vermillion)] transition-colors cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
                        >
                          {creator.logoUrl ? (
                            <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-[10px] text-[var(--qoe-vermillion)]">
                              {creator.name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </motion.button>
                      }
                    />
                    <TooltipContent
                      side="right"
                      className="bg-white text-[var(--text-primary)] text-xs border border-[var(--border-default)] p-3 shadow-lg rounded-md flex flex-col gap-2 w-48 z-50 ml-2"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-[12px] text-neutral-900 leading-none">
                          {creator.name}
                        </span>
                        <span className="text-[10px] text-neutral-400 mt-1">
                          @{creator.username || creator.subdomain}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleFollowToggle(creator)
                        }}
                        className={cn(
                          "w-full text-[10px] font-bold py-1.5 rounded-sm transition-colors text-center cursor-pointer",
                          isFollowed
                            ? "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                            : "bg-[var(--qoe-vermillion)] text-white hover:bg-[#d63c1e]"
                        )}
                      >
                        {isFollowed ? "Abonné" : "Suivre"}
                      </button>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </TooltipProvider>

      </div>
    </div>
    </>
  )
}
