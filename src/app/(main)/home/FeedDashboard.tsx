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
  const [activeFeed, setActiveFeed] = useState<string>("recommandation")
  
  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks)
  const [followedCreators, setFollowedCreators] = useState<any[]>(initialFollowedCreators)
  const [followsCount, setFollowsCount] = useState<number>(initialFollowsCount)
  const [bookmarksCount, setBookmarksCount] = useState<number>(initialBookmarksCount)
  
  const { addTab } = useTabStore()

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [localPosts, setLocalPosts] = useState<Article[]>([])
  
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Marc Dutronc a publié 'Souveraineté Numérique en Europe'", time: "Il y a 5 min", unread: true },
    { id: 2, text: "Votre note sur 'L'éveil de l'IA' a été synchronisée", time: "Il y a 2h", unread: false },
  ])

  const isCreatorFollowed = (creatorId: string) => followedCreators.some(f => f.id === creatorId)
  const isArticleBookmarked = (articleId: string) => bookmarks.some(b => b.id === articleId)

  const handleFollowToggle = async (creator: any) => {
    // Optimistic Update
    const isCurrentlyFollowed = isCreatorFollowed(creator.id)
    
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

    if (selectedTag) {
      list = list.filter(art => 
        art.title.toLowerCase().includes(selectedTag.toLowerCase()) || 
        art.content.toLowerCase().includes(selectedTag.toLowerCase()) || 
        (art.category && art.category.name.toLowerCase() === selectedTag.toLowerCase())
      )
    }

    return list
  }, [activeFeed, localPosts, recommendationArticles, followingArticles, discoverArticles, bookmarks, selectedTag, followedCreators])

  const tagsList = ["#souverainete", "#anti-ia", "#attention", "#philosophie", "#design", "#creators"]

  return (
    <div className="pb-24 max-w-6xl mx-auto selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-14 items-start px-4 sm:px-6 mt-6">
        
        {/* ========================================================================= */}
        {/* MIDDLE COLUMN: Flat editorial feed without the big red background box     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Top Segmented Tabs with sharp borders and dynamic blur */}
          <FeedTabsHeader 
            activeFeed={activeFeed}
            onTabChange={(id) => {
              setActiveFeed(id)
              setSelectedTag(null)
            }}
            totalCount={currentFeedArticles.length}
          />

          {/* Clean, sharp grid bento flow */}
          <div className="space-y-4">
            {activeFeed !== "bookmarks" && activeFeed !== "following_creators" && activeFeed !== "notifications" && (
              <MicroPostComposer 
                dbUser={dbUser}
                tagsList={tagsList}
                onPostCreated={(newPost) => setLocalPosts(prev => [newPost, ...prev])}
              />
            )}

            <div className="space-y-4">
              {selectedTag && (
                <div className="bg-neutral-50 border border-neutral-200/50 rounded-lg px-4 py-2 text-xs flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Filtre actif : <strong className="font-mono text-[#EE4B2B]">#{selectedTag.replace('#','')}</strong></span>
                  <button 
                    onClick={() => setSelectedTag(null)}
                    className="text-[10px] font-bold uppercase tracking-wider text-[#EE4B2B] hover:opacity-85 transition-opacity"
                  >
                    Effacer
                  </button>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {activeFeed === "bookmarks" && currentFeedArticles.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={springs.card}
                    className="bg-white border border-neutral-200/50 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3 text-neutral-600 shadow-xs"
                  >
                    <BookMarked className="w-8 h-8 text-neutral-300" />
                    <h4 className="font-bold text-xs text-neutral-800">Votre Sanctuaire est vide</h4>
                    <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                      Enregistrez des articles en cliquant sur l'icône de signet pour les conserver ici.
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
                      className="bg-white border border-neutral-200/50 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3 text-neutral-600 shadow-xs"
                    >
                      <AlertCircle className="w-8 h-8 text-neutral-300" />
                      <h4 className="font-bold text-xs text-neutral-800">Aucun article trouvé</h4>
                      <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                        Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Découvrir.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
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
          tagsList={tagsList}
          selectedTag={selectedTag}
          onTagClick={(tag) => setSelectedTag(selectedTag === tag ? null : tag)}
          suggestedCreators={suggestedCreators}
          onFollowToggle={handleFollowToggle}
        />

      </div>
    </div>
  )
}
