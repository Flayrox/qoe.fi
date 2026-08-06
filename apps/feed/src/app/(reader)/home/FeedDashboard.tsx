"use client"

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"
import { 
  BookMarked, AlertCircle
} from "lucide-react"
import { toggleFollowCreatorHome, toggleBookmarkArticleHome } from "./actions"
import { cn } from "@qoe/utils"
import { ArticleCard } from "./components/ArticleCard"
import { MicroPostComposer } from "./components/MicroPostComposer"
import { FeedTabsHeader } from "./components/FeedTabsHeader"
import { ExpandedPostView } from "./components/ExpandedPostView"
import { HomeWidgets } from "./components/HomeWidgets"
import { LoginModal } from "./components/LoginModal"
import { GuestFloatingBar, type AuthActionContext } from "@/components/feed/GuestFloatingBar"
import { useTranslate } from "@qoe/i18n"
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
  mutedWords?: string[]
  featuredArticle: any
  recommendedArticles: any[]
  trends: any[]
  promos: any[]
}

// Spring physics — Rauno-style, never ease-in-out
const springs = {
  card: { type: "spring" as const, stiffness: 350, damping: 28 },
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
  mutedWords = [],
  featuredArticle,
  recommendedArticles,
  trends,
  promos,
}: FeedDashboardProps) {
  const { t } = useTranslate()
  const [activeFeed, setActiveFeed] = useState<string>("recommandation")
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login")
  const [authActionContext, setAuthActionContext] = useState<AuthActionContext | undefined>(undefined)

  const openAuth = (options?: { mode?: "login" | "signup"; actionContext?: AuthActionContext }) => {
    setAuthModalMode(options?.mode || "login")
    setAuthActionContext(options?.actionContext)
    setIsLoginModalOpen(true)
  }
  
  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks)
  const [followedCreators, setFollowedCreators] = useState<any[]>(initialFollowedCreators)
  const [followsCount, setFollowsCount] = useState<number>(initialFollowsCount)
  const [bookmarksCount, setBookmarksCount] = useState<number>(initialBookmarksCount)

  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  
  const [localPosts, setLocalPosts] = useState<Article[]>([])
  const [deletedPostIds, setDeletedPostIds] = useState<Set<string>>(new Set())
  const [interactions, setInteractions] = useState<Record<string, { liked?: boolean; likesCount?: number; bookmarked?: boolean; repliesCount?: number }>>({})
  
  const isCreatorFollowed = (creatorId: string) => followedCreators.some(f => f.id === creatorId)
  const isArticleBookmarked = (articleId: string) => {
    const inter = interactions[articleId]
    if (inter?.bookmarked !== undefined) return inter.bookmarked
    return bookmarks.some(b => b.id === articleId)
  }

  const handleFollowToggle = async (creator: any) => {
    if (!dbUser) {
      openAuth({ mode: "signup", actionContext: "follow" })
      return
    }
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
      if (isCurrentlyFollowed) {
        setFollowedCreators(prev => [creator, ...prev])
        setFollowsCount(prev => prev + 1)
      } else {
        setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
        setFollowsCount(prev => Math.max(0, prev - 1))
      }
    } else if (res.data) {
      const actualFollowed = res.data.followed
      if (actualFollowed) {
        setFollowedCreators(prev => prev.some(f => f.id === creator.id) ? prev : [creator, ...prev])
      } else {
        setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
      }
    }
  }

  const handleBookmarkToggle = async (article: Article) => {
    if (!dbUser) {
      openAuth({ mode: "signup", actionContext: "bookmark" })
      return
    }
    const isCurrentlyBookmarked = isArticleBookmarked(article.id)
    
    // Optimistic local state update
    setInteractions(prev => ({
      ...prev,
      [article.id]: {
        ...prev[article.id],
        bookmarked: !isCurrentlyBookmarked
      }
    }))
    
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
      setInteractions(prev => ({
        ...prev,
        [article.id]: {
          ...prev[article.id],
          bookmarked: isCurrentlyBookmarked
        }
      }))
      if (isCurrentlyBookmarked) {
        setBookmarks(prev => [article, ...prev])
        setBookmarksCount(prev => prev + 1)
      } else {
        setBookmarks(prev => prev.filter(b => b.id !== article.id))
        setBookmarksCount(prev => Math.max(0, prev - 1))
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

    // Filter out posts and articles containing any of the user's muted words
    if (mutedWords && mutedWords.length > 0) {
      list = list.filter(art => {
        if (!art) return false
        const contentLower = (art.content || "").toLowerCase()
        const titleLower = (art.title || "").toLowerCase()
        return !mutedWords.some(word => contentLower.includes(word) || titleLower.includes(word))
      })
    }

    list = list.filter(art => art && art.id && !deletedPostIds.has(art.id))

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
  }, [activeFeed, localPosts, recommendationArticles, followingArticles, discoverArticles, bookmarks, selectedTag, followedCreators, deletedPostIds, mutedWords])

  const tagsList = ["#souverainete", "#anti-ia", "#attention", "#philosophie", "#design", "#creators"]

  return (
    <ReaderPageLayout 
      giantTitle="Lire"
      headerWidgets={
        <HomeWidgets
          featuredArticle={featuredArticle}
          recommendedArticles={recommendedArticles}
          trends={trends}
          promos={promos}
        />
      }
    >
        {/* ── STICKY TABS WRAPPER (z-30) ── */}
        <div className="sticky top-0 z-30 w-full flex items-baseline justify-center py-4 px-6 bg-transparent pointer-events-auto">
          <FeedTabsHeader 
            activeFeed={activeFeed}
            onTabChange={(id) => {
              if (activeFeed === id) {
                window.scrollTo({ top: 0, behavior: "smooth" })
              } else {
                setActiveFeed(id)
                setSelectedTag(null)
                setActivePostId(null) // Reset expanded post view on tab change
                trackEvent("feed_tab_changed", { tab: id })
              }
            }}
          />
        </div>

        {/* Main timeline white bento sheet */}
        <div className="bg-white shadow-[0_8px_30px_rgba(0,0,0,0.02)] border border-neutral-200/40 rounded-t-xl min-h-screen mt-12 relative z-20">

          {/* Sticky header of the sheet itself to mask scroll items and provide background for the tabs */}
          <div className="sticky top-0 z-10 h-[44px] bg-white rounded-t-xl border-t border-x border-neutral-200/40 -mx-[1px] -mt-[1px]" />

          <div className="px-6 pt-2 pb-6">
            <AnimatePresence mode="wait">
              {activePostId ? (
                <motion.div
                  key="expanded-post"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={springs.card}
                >
                  <ExpandedPostView
                    postId={activePostId}
                    currentUserId={dbUser?.id || null}
                    onClose={() => setActivePostId(null)}
                    onOpenProfile={(username) => {
                      window.location.href = `/profile/${username}`
                    }}
                    onInteractionUpdate={(postId, update) => {
                      setInteractions(prev => ({
                        ...prev,
                        [postId]: {
                          ...prev[postId],
                          ...update
                        }
                      }))
                    }}
                    onLoginRequired={() => setIsLoginModalOpen(true)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="feed-list"
                  initial={{ opacity: 0, y: -15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  transition={springs.card}
                  className="space-y-6"
                >
                  {activeFeed !== "bookmarks" && activeFeed !== "following_creators" && activeFeed !== "notifications" && (
                    <MicroPostComposer 
                      dbUser={dbUser}
                      tagsList={tagsList}
                      onPostCreated={(post) => setLocalPosts(prev => [post, ...prev])}
                      onLoginRequired={() => setIsLoginModalOpen(true)}
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
                          className="bg-white/60 backdrop-blur-sm border border-[var(--border-subtle)] rounded-md p-12 text-center flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]"
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
                            className="bg-white/60 backdrop-blur-sm border border-[var(--border-subtle)] rounded-md p-16 text-center flex flex-col items-center justify-center gap-3"
                          >
                            <AlertCircle className="w-8 h-8 text-[var(--text-quaternary)]" />
                            <h4 className="font-bold text-xs text-[var(--text-primary)]">{t("feed.no_article_found", "Aucun article trouvé")}</h4>
                            <p className="text-[11px] text-[var(--text-tertiary)] max-w-xs leading-relaxed">
                              {t("feed.no_article_found_desc", "Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Explorer.")}
                            </p>
                          </motion.div>
                        ) : (
                          <div key={`feed-${activeFeed}`} className="space-y-0">
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
                                  onOpenPost={setActivePostId}
                                  onOpenProfile={(username) => {
                                    window.location.href = `/profile/${username}`
                                  }}
                                />
                              )
                            })}
                          </div>
                        )
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <LoginModal 
          isOpen={isLoginModalOpen} 
          onClose={() => setIsLoginModalOpen(false)} 
          initialMode={authModalMode}
          actionContext={authActionContext}
        />
        {!dbUser && <GuestFloatingBar onOpenAuth={openAuth} />}
    </ReaderPageLayout>
  )
}
