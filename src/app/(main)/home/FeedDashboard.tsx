"use client"

import React, { useState, useMemo } from "react"
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
    <div className="pb-24 max-w-6xl mx-auto selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start px-4 sm:px-6 mt-6">
        
        {/* ========================================================================= */}
        {/* MIDDLE COLUMN: Flat editorial feed without the big red background box     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 bg-white border border-[var(--border-subtle)] rounded-md p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.01),0_10px_35px_rgba(0,0,0,0.02)] space-y-6">
          
          {/* Top Segmented Tabs with sharp borders and dynamic blur */}
          <FeedTabsHeader 
            activeFeed={activeFeed}
            onTabChange={(id) => {
              setActiveFeed(id)
              setSelectedTag(null)
              trackEvent("feed_tab_changed", { tab: id })
            }}
            totalCount={currentFeedArticles.length}
          />

          {/* Clean, sharp grid bento flow */}
          <div className="space-y-4">
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
                    <div key={`feed-${activeFeed}`} className="space-y-6 relative pl-5 sm:pl-7 border-l border-neutral-100/80 ml-2 sm:ml-3">
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

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Composed Sidebar Widgets                                    */}
        {/* ========================================================================= */}
        <FeedSidebarWidgets 
          suggestedCreators={suggestedCreators}
          onFollowToggle={handleFollowToggle}
          userStats={{
            articlesRead: 12,
            highlights: initialHighlightsCount || 4,
            following: followsCount
          }}
        />

      </div>
    </div>
  )
}
