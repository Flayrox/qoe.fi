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
    <div className="space-y-6 max-w-5xl mx-auto selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* MIDDLE COLUMN: Flat editorial feed without the big red background box     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Top Segmented Tabs with sharp borders and dynamic blur */}
          <div className="sticky top-0 z-40 py-2.5 bg-[#FAFAFA]/80 backdrop-blur-xl border-b border-neutral-200/40 flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-white border border-neutral-200/50 rounded-xl shadow-xs">
              {[
                { id: "recommandation", label: "Recommandation" },
                { id: "abonnement", label: "Abonnement" },
                { id: "decouvrir", label: "Découvrir" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFeed(tab.id)
                    setSelectedTag(null)
                  }}
                  className="relative px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-colors duration-200 flex items-center justify-center gap-1.5 outline-none cursor-pointer"
                >
                  {activeFeed === tab.id && (
                    <motion.div
                      layoutId="activeFeedTab"
                      transition={springs.tab}
                      className="absolute inset-0 bg-neutral-50 border border-neutral-200/60 rounded-lg shadow-xs"
                    />
                  )}
                  <span className={cn(
                    "relative z-10 transition-colors duration-300", 
                    activeFeed === tab.id ? "text-[#EE4B2B] font-bold" : "text-neutral-500 hover:text-neutral-800"
                  )}>
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
            
            <span className="text-[10px] font-mono text-neutral-400 font-semibold px-2.5 py-1 bg-white rounded-lg border border-neutral-200/40">
              {currentFeedArticles.length} publications
            </span>
          </div>

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
        {/* RIGHT COLUMN: Accents & Sharp Bento widgets                              */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 lg:sticky lg:top-16 space-y-4 select-none">
          
          {/* Card 1: Popular Hashtags */}
          <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-[#EE4B2B]" /> Populaires & Hashtags
            </span>
            
            <div className="flex flex-wrap gap-1.5">
              {tagsList.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all border cursor-pointer",
                    selectedTag === tag
                      ? "bg-[#EE4B2B] border-[#EE4B2B] text-white shadow-xs"
                      : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Actualités with surgical Vermillion accents */}
          <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#EE4B2B]" /> Actualité & Souveraineté
            </span>
            
            <div className="space-y-4">
              {[
                { title: "Calibrage vectoriel", desc: "L'Algorithme de Sérendipité pgvector a été synchronisé.", date: "Aujourd'hui" },
                { title: "Sanctuaire Attentionnel", desc: "Déploiement du carnet de notes monastique finalisé.", date: "Hier" },
                { title: "Croissance", desc: "QOE.FI dépasse les 10 000 lecteurs mensuels souverains.", date: "24 Mai" }
              ].map((news, i) => (
                <div key={i} className="flex flex-col gap-1 border-l-2 border-neutral-100 hover:border-[#EE4B2B] pl-3 transition-colors duration-300 group">
                  <span className="text-[9px] text-neutral-400 font-bold block leading-none font-mono">{news.date}</span>
                  <span className="text-xs font-semibold text-neutral-800 group-hover:text-[#EE4B2B] transition-colors duration-300 block leading-tight mt-1">{news.title}</span>
                  <span className="text-[10px] text-neutral-400 leading-relaxed block mt-0.5">{news.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested creators discovery */}
          {suggestedCreators.length > 0 && (
            <div className="bg-white border border-neutral-200/50 rounded-xl p-5 shadow-xs hover:border-neutral-300 transition-all duration-300">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block mb-4 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#EE4B2B]" /> À Découvrir
              </span>
              
              <div className="space-y-3.5">
                {suggestedCreators.map(creator => {
                  return (
                    <div key={creator.id} className="flex items-center justify-between gap-3">
                      <div 
                        onClick={() => addTab({
                          id: `profile-${creator.username || creator.subdomain}`,
                          title: creator.name || `@${creator.username || creator.subdomain}`,
                          type: "profile",
                          username: creator.username || creator.subdomain
                        })}
                        className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition-opacity cursor-pointer group/sug"
                      >
                        <div className="w-8 h-8 rounded-md overflow-hidden border border-neutral-200/30 shrink-0 shadow-xs">
                          {creator.logoUrl ? (
                            <img src={creator.logoUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-[9px] text-[#EE4B2B]">
                              {creator.name?.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold block leading-none truncate group-hover/sug:text-[#EE4B2B] transition-colors duration-200">{creator.name}</span>
                          <span className="text-[9px] text-neutral-400 block truncate mt-1 font-mono">@{creator.username || creator.subdomain}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleFollowToggle(creator)}
                        className="bg-[#EE4B2B]/5 hover:bg-[#EE4B2B] hover:text-white border border-[#EE4B2B]/20 text-[#EE4B2B] font-bold text-[9px] px-2.5 py-1.5 rounded-md transition-all shrink-0 cursor-pointer"
                      >
                        Suivre
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
