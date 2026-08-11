"use client"

import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"
import { 
  BookMarked, AlertCircle
} from "lucide-react"
import { 
  toggleFollowCreatorHomeAction as toggleFollowCreatorHome, 
  toggleBookmarkArticleHomeAction as toggleBookmarkArticleHome, 
  toggleLikePostAction as toggleLikePost, 
  toggleRepostPostAction as toggleRepostPost,
  getArticleThreadAction as getArticleThread
} from "@qoe/api-client/actions/feed"

import { ArticleCard, GuestFloatingBar, useAuthModal, MediaLightbox, HotkeyHelpModal, type AuthActionContext } from "@qoe/ui"
import { ThoughtCard } from "@/components/social/ThoughtCard"
import { VirtualizedFeedList } from "@/components/feed/VirtualizedFeedList"
import { RealtimeFeedPill } from "@/components/feed/RealtimeFeedPill"
import { useRealtimeFeedBuffer } from "@/hooks/useRealtimeFeedBuffer"
import { 
  useOptimisticLike, 
  useOptimisticRepost, 
  useOptimisticBookmark, 
  useOptimisticFollow,
  updateThoughtShadow
} from "@qoe/api-client"
import { ComposerModal } from "./components/ComposerModal"
import { FeedTabsHeader } from "./components/FeedTabsHeader"
import { ThoughtThreadView } from "./components/ThoughtThreadView"
import { ArticleReaderDrawer } from "@/components/social/ArticleReaderDrawer"
import { useTranslate } from "@qoe/i18n"
import { trackEvent } from "@/lib/analytics"
import { routes } from "@qoe/config/routes"
import { cn } from "@qoe/utils"

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
  accessGranted?: boolean
  isLoading?: boolean
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

// Spring physics — Rauno-style
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
  mutedWords = [],
}: FeedDashboardProps) {
  const { t } = useTranslate()
  const [activeFeed, setActiveFeed] = useState<string>("recommandation")
  const [activePostId, setActivePostId] = useState<string | null>(null)
  const [activeArticle, setActiveArticle] = useState<Article | null>(null)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false)
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false)
  const [lightboxImages, setLightboxImages] = useState<{ url: string; alt?: string | null }[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<"login" | "signup">("login")
  const [authActionContext, setAuthActionContext] = useState<AuthActionContext | undefined>(undefined)

  // Global Hotkeys Listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if typing inside an input/textarea
      const target = e.target as HTMLElement
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        setIsComposerModalOpen(true)
      } else if (e.key === "?") {
        e.preventDefault()
        setIsHotkeyModalOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const { mutate: mutateLike } = useOptimisticLike()
  const { mutate: mutateRepost } = useOptimisticRepost()
  const { mutate: mutateBookmark } = useOptimisticBookmark()
  const { mutate: mutateFollow } = useOptimisticFollow()

  const { unreadCount, flushBuffer } = useRealtimeFeedBuffer({
    enabled: activeFeed === "recommandation" || activeFeed === "abonnement",
    type: activeFeed === "abonnement" ? "following" : "for-you",
  })

  const { openAuthModal } = useAuthModal()

  const openAuth = (options?: { mode?: "login" | "signup"; actionContext?: AuthActionContext }) => {
    openAuthModal({ mode: options?.mode || "login", actionContext: options?.actionContext })
  }

  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks)
  const [followedCreators, setFollowedCreators] = useState<any[]>(initialFollowedCreators)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [localPosts, setLocalPosts] = useState<Article[]>([])
  const [deletedPostIds] = useState<Set<string>>(new Set())
  const [interactions, setInteractions] = useState<Record<string, { liked?: boolean; likesCount?: number; bookmarked?: boolean; repliesCount?: number; reposted?: boolean; repostsCount?: number }>>({})
  
  const isCreatorFollowed = (creatorId: string) => followedCreators.some(f => f.id === creatorId)
  const isArticleBookmarked = (articleId: string) => {
    const inter = interactions[articleId]
    if (inter?.bookmarked !== undefined) return inter.bookmarked
    return bookmarks.some(b => b.id === articleId)
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

  const handleLikeToggle = (postId: string) => {
    if (!dbUser) {
      openAuth({ mode: "signup", actionContext: "like" })
      return
    }
    const currentItem = currentFeedArticles.find((item) => item.id === postId) as any

    setInteractions((prev) => {
      const prevInter = prev[postId]
      const wasLiked = prevInter?.liked !== undefined ? prevInter.liked : (currentItem?.liked || currentItem?.isLiked || false)
      const baseCount = currentItem?.likeCount ?? currentItem?.likesCount ?? 0
      const prevCount = prevInter?.likesCount !== undefined ? prevInter.likesCount : baseCount
      const nowLiked = !wasLiked
      const newCount = nowLiked ? prevCount + 1 : Math.max(0, prevCount - 1)

      updateThoughtShadow(postId, { isLiked: nowLiked, likeCount: newCount })

      mutateLike({
        thoughtId: postId,
        isLikedCurrent: wasLiked,
        likeMutationFn: async (id: string) => {
          const res = await toggleLikePost(id)
          return { success: res.ok }
        },
      })

      return {
        ...prev,
        [postId]: {
          ...prevInter,
          liked: nowLiked,
          likesCount: newCount,
        },
      }
    })
  }

  const handleRepostToggle = (postId: string) => {
    if (!dbUser) {
      openAuth({ mode: "signup", actionContext: "repost" })
      return
    }
    const currentItem = currentFeedArticles.find((item) => item.id === postId) as any

    setInteractions((prev) => {
      const prevInter = prev[postId]
      const wasReposted = prevInter?.reposted !== undefined ? prevInter.reposted : (currentItem?.reposted || currentItem?.isReposted || false)
      const baseCount = currentItem?.repostCount ?? currentItem?.repostsCount ?? 0
      const prevCount = prevInter?.repostsCount !== undefined ? prevInter.repostsCount : baseCount
      const nowReposted = !wasReposted
      const newCount = nowReposted ? prevCount + 1 : Math.max(0, prevCount - 1)

      updateThoughtShadow(postId, { reposted: nowReposted, repostCount: newCount })

      mutateRepost({
        thoughtId: postId,
        isRepostedCurrent: wasReposted,
        repostMutationFn: async (id: string) => {
          const res = await toggleRepostPost(id)
          return { success: res.ok }
        },
      })

      return {
        ...prev,
        [postId]: {
          ...prevInter,
          reposted: nowReposted,
          repostsCount: newCount,
        },
      }
    })
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
    } else {
      setFollowedCreators(prev => [creator, ...prev])
    }

    mutateFollow({
      creatorId: creator.id,
      isFollowedCurrent: isCurrentlyFollowed,
      followMutationFn: async (id: string) => {
        const res = await toggleFollowCreatorHome(id)
        return { success: res.ok }
      }
    })
  }

  const handleBookmarkToggle = async (article: Article) => {
    if (!dbUser) {
      openAuth({ mode: "signup", actionContext: "bookmark" })
      return
    }
    const isCurrentlyBookmarked = isArticleBookmarked(article.id)
    
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
    } else {
      setBookmarks(prev => [article, ...prev])
    }

    mutateBookmark({
      articleId: article.id,
      isBookmarkedCurrent: isCurrentlyBookmarked,
      bookmarkMutationFn: async (id: string) => {
        const res = await toggleBookmarkArticleHome(id)
        return { success: res.ok }
      }
    })
  }

  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0)

  const handleOpenPost = (postId: string, authorUsername?: string) => {
    const scroll = window.scrollY
    setSavedScrollPosition(scroll)
    const foundItem = currentFeedArticles.find(item => item.id === postId)
    const handle = authorUsername || foundItem?.author?.username || foundItem?.author?.subdomain || foundItem?.author?.id || "author"
    const newUrl = routes.feed.thought(handle, postId)
    window.history.pushState({ postId, scroll }, "", newUrl)
    setActivePostId(postId)
    setActiveArticle(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleClosePost = () => {
    setActivePostId(null)
    if (window.location.pathname.includes("/thought/")) {
      window.history.pushState(null, "", routes.feed.home())
    }
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: "instant" })
    }, 50)
  }

  const handleOpenArticle = async (articleInput: any) => {
    const scroll = window.scrollY
    setSavedScrollPosition(scroll)
    const slug = articleInput?.slug || articleInput?.id
    if (!slug) return

    window.history.pushState({ articleSlug: slug, scroll }, "", routes.feed.article(slug))

    if (articleInput && articleInput.content && articleInput.title && articleInput.author) {
      setActiveArticle(articleInput)
      setActivePostId(null)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Immediately open drawer with loading state while fetching full article thread
    setActiveArticle({
      id: articleInput.id || slug,
      title: articleInput.title || "Chargement...",
      slug: slug,
      content: "",
      readingTime: articleInput.readingTime || 3,
      createdAt: articleInput.createdAt || new Date(),
      author: articleInput.author || { id: "loading", name: "Chargement...", username: "..." },
      category: null,
      published: true,
      isPremium: articleInput.isPremium || false,
      isLoading: true,
    })
    setActivePostId(null)
    window.scrollTo({ top: 0, behavior: "smooth" })

    try {
      const res = await getArticleThread(slug)
      if (res.ok && res.data?.article) {
        setActiveArticle(res.data.article)
      } else {
        window.location.href = routes.feed.article(slug)
      }
    } catch {
      window.location.href = routes.feed.article(slug)
    }
  }

  const handleCloseArticle = () => {
    setActiveArticle(null)
    if (window.location.pathname.includes("/article/")) {
      window.history.pushState(null, "", routes.feed.home())
    }
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: "instant" })
    }, 50)
  }

  React.useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.postId) {
        setActivePostId(e.state.postId)
        setActiveArticle(null)
      } else if (e.state?.articleSlug) {
        const found = currentFeedArticles.find(item => item.slug === e.state.articleSlug)
        if (found) {
          setActiveArticle(found)
        }
        setActivePostId(null)
      } else {
        setActivePostId(null)
        setActiveArticle(null)
        if (e.state?.scroll !== undefined) {
          window.scrollTo({ top: e.state.scroll, behavior: "instant" })
        }
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [currentFeedArticles])

  const [composerQuotedThought, setComposerQuotedThought] = useState<any | null>(null)
  const [composerReplyToThought, setComposerReplyToThought] = useState<any | null>(null)
  const [composerQuotedArticle, setComposerQuotedArticle] = useState<any | null>(null)
  const [composerQuotedExcerpt, setComposerQuotedExcerpt] = useState<string | null>(null)
  const [composerInitialText, setComposerInitialText] = useState<string>("")
  const [composerInitialMode, setComposerInitialMode] = useState<"thought" | "article">("thought")

  React.useEffect(() => {
    const handleOpenComposer = (e: Event) => {
      if (!dbUser) {
        openAuth({ mode: "signup", actionContext: "bookmark" })
        return
      }
      const customDetail = (e as CustomEvent)?.detail
      if (customDetail?.replyToThought) {
        setComposerReplyToThought(customDetail.replyToThought)
        setComposerQuotedThought(null)
        setComposerQuotedArticle(null)
        setComposerQuotedExcerpt(null)
        setComposerInitialText(customDetail.initialText || "")
        setComposerInitialMode("thought")
      } else if (customDetail?.quotedThought) {
        setComposerQuotedThought(customDetail.quotedThought)
        setComposerReplyToThought(null)
        setComposerQuotedArticle(null)
        setComposerQuotedExcerpt(null)
        setComposerInitialText(customDetail.initialText || "")
        setComposerInitialMode("thought")
      } else if (customDetail?.quotedArticle) {
        setComposerQuotedArticle(customDetail.quotedArticle)
        setComposerQuotedExcerpt(customDetail.quotedExcerpt || null)
        setComposerQuotedThought(null)
        setComposerReplyToThought(null)
        setComposerInitialText(customDetail.initialText || "")
        setComposerInitialMode("thought")
      } else if (customDetail?.initialText) {
        setComposerInitialText(customDetail.initialText)
        setComposerQuotedThought(null)
        setComposerReplyToThought(null)
        setComposerQuotedArticle(null)
        setComposerQuotedExcerpt(null)
        setComposerInitialMode("thought")
      } else if (customDetail?.mode) {
        setComposerInitialMode(customDetail.mode)
        setComposerQuotedThought(null)
        setComposerReplyToThought(null)
        setComposerQuotedArticle(null)
        setComposerQuotedExcerpt(null)
        setComposerInitialText("")
      } else {
        setComposerQuotedThought(null)
        setComposerReplyToThought(null)
        setComposerQuotedArticle(null)
        setComposerQuotedExcerpt(null)
        setComposerInitialText("")
        setComposerInitialMode("thought")
      }
      setIsComposerModalOpen(true)
    }

    const handleResetFeedView = () => {
      setActivePostId(null)
      setActiveArticle(null)
      if (window.location.pathname.includes("/thought/") || window.location.pathname.includes("/article/")) {
        window.history.pushState(null, "", routes.feed.home())
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "n")) {
        e.preventDefault()
        handleOpenComposer(e)
      }
    }

    const handleThoughtCreated = (e: Event) => {
      const customDetail = (e as CustomEvent)?.detail
      if (customDetail && customDetail.id) {
        setLocalPosts(prev => [customDetail, ...prev])
      }
    }

    window.addEventListener("open-composer", handleOpenComposer)
    window.addEventListener("thought-created", handleThoughtCreated)
    window.addEventListener("reset-feed-view", handleResetFeedView)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("open-composer", handleOpenComposer)
      window.removeEventListener("thought-created", handleThoughtCreated)
      window.removeEventListener("reset-feed-view", handleResetFeedView)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [dbUser])
  
  const tagsList = ["#souverainete", "#anti-ia", "#attention", "#philosophie", "#design", "#creators"]

  return (
    <ReaderPageLayout giantTitle="Lire" hideHeader={!!activePostId || !!activeArticle}>
      {/* ── SLIDING FEED SHEET ── */}
      <motion.main 
        initial={false}
        animate={{
          marginTop: (activePostId || activeArticle) ? 0 : 256
        }}
        transition={{ type: "spring", stiffness: 350, damping: 32 }}
        className={cn(
          "bg-card/95 backdrop-blur-2xl text-card-foreground border-x border-border/40 shadow-2xl min-h-screen relative z-10 transition-colors",
          (activePostId || activeArticle) ? "rounded-none border-t-0" : "rounded-t-2xl border-t"
        )}
      >
        
        {/* Opaque Sticky Header of the Sheet (No Background Bleed-Through) */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-card border-b border-border/40 rounded-t-2xl">
          <FeedTabsHeader 
            activeFeed={activeFeed}
            onTabChange={(id) => {
              if (activeFeed === id) {
                window.scrollTo({ top: 0, behavior: "smooth" })
              } else {
                setActiveFeed(id)
                setSelectedTag(null)
                setActivePostId(null)
                setActiveArticle(null)
                trackEvent("feed_tab_changed", { tab: id })
              }
            }}
          />
        </div>

        {/* List of Stream Items */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          <AnimatePresence mode="popLayout">
            {activePostId ? (
              <motion.div
                key="expanded-post"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
              >
                <ThoughtThreadView
                  postId={activePostId}
                  currentUserId={dbUser?.id || null}
                  onClose={handleClosePost}
                  onOpenArticle={handleOpenArticle}
                  onOpenProfile={(username) => {
                    window.location.href = routes.feed.profile(username)
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
                  onLoginRequired={() => openAuthModal({ mode: "login" })}
                />
              </motion.div>
            ) : (
              <motion.div
                key="feed-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {activeFeed === "bookmarks" && currentFeedArticles.length === 0 && (
                      <motion.div
                        key="bookmarks-empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="bg-muted/40 border border-border/40 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-2.5 text-muted-foreground"
                      >
                        <BookMarked className="w-7 h-7 text-muted-foreground/60" />
                        <h4 className="font-semibold text-xs text-foreground">{t("feed.empty_sanctuary", "Votre Sanctuaire est vide")}</h4>
                        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                          {t("feed.empty_sanctuary_desc", "Enregistrez des articles en cliquant sur l'icône de signet pour les conserver ici.")}
                        </p>
                      </motion.div>
                    )}

                    {currentFeedArticles.length === 0 && activeFeed !== "bookmarks" ? (
                      <motion.div
                        key="empty-state"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-muted/40 border border-border/40 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-2.5"
                      >
                        <AlertCircle className="w-7 h-7 text-muted-foreground/60" />
                        <h4 className="font-semibold text-xs text-foreground">{t("feed.no_article_found", "Aucun article trouvé")}</h4>
                        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                          {t("feed.no_article_found_desc", "Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Explorer.")}
                        </p>
                      </motion.div>
                    ) : (
                      <div key={`feed-${activeFeed}`} className="space-y-4">
                        <RealtimeFeedPill unreadCount={unreadCount} onFlush={flushBuffer} />
                        <VirtualizedFeedList
                          items={currentFeedArticles}
                          keyExtractor={(article) => article.id}
                          estimateSize={180}
                          renderItem={(article, idx) => {
                            const isBookmarked = isArticleBookmarked(article.id)
                            const isFollowed = isCreatorFollowed(article.author.id)

                            if (!article.title) {
                              const inter = interactions[article.id]
                              const postData = {
                                ...article,
                                liked: inter?.liked !== undefined ? inter.liked : (article as any).liked,
                                likesCount: inter?.likesCount !== undefined ? inter.likesCount : (article as any).likeCount || (article as any).likesCount,
                                reposted: inter?.reposted !== undefined ? inter.reposted : (article as any).reposted,
                                repostsCount: inter?.repostsCount !== undefined ? inter.repostsCount : (article as any).repostCount || (article as any).repostsCount,
                              }

                              return (
                                <ThoughtCard
                                  post={postData as any}
                                  variant="timeline"
                                  currentUserId={dbUser?.id || null}
                                  onOpenPost={handleOpenPost}
                                  onOpenArticle={handleOpenArticle}
                                  onOpenProfile={(username) => {
                                    window.location.href = routes.feed.profile(username)
                                  }}
                                  onLikeToggle={handleLikeToggle}
                                  onRepostToggle={handleRepostToggle}
                                />
                              )
                            }

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
                                onOpenArticle={handleOpenArticle}
                                onOpenPost={handleOpenPost}
                                onOpenProfile={(username) => {
                                  window.location.href = routes.feed.profile(username)
                                }}
                              />
                            )
                          }}
                        />
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>

      <ArticleReaderDrawer
        isOpen={!!activeArticle}
        article={activeArticle}
        onClose={handleCloseArticle}
      />

      <ComposerModal
        isOpen={isComposerModalOpen}
        onClose={() => {
          setIsComposerModalOpen(false)
          setComposerQuotedThought(null)
          setComposerReplyToThought(null)
          setComposerQuotedArticle(null)
          setComposerQuotedExcerpt(null)
          setComposerInitialText("")
        }}
        dbUser={dbUser}
        tagsList={tagsList}
        quotedThought={composerQuotedThought}
        replyToThought={composerReplyToThought}
        quotedArticle={composerQuotedArticle}
        quotedExcerpt={composerQuotedExcerpt}
        initialText={composerInitialText}
        initialMode={composerInitialMode}
        onPostCreated={(post) => setLocalPosts(prev => [post, ...prev])}
        onLoginRequired={() => openAuthModal({ mode: "signup", actionContext: "comment" })}
      />
      <MediaLightbox
        isOpen={isLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setIsLightboxOpen(false)}
      />
      <HotkeyHelpModal
        isOpen={isHotkeyModalOpen}
        onClose={() => setIsHotkeyModalOpen(false)}
      />
      {!dbUser && <GuestFloatingBar onOpenAuth={(opts) => openAuthModal({ mode: opts?.mode, actionContext: opts?.actionContext })} />}
    </ReaderPageLayout>
  )
}
