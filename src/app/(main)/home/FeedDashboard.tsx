"use client"

import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Activity, BookMarked, Highlighter, Wallet, Users, Compass, 
  ExternalLink, Bell, Settings, Plus, Hash, Bookmark, 
  UserPlus, UserCheck, Check, Send, Sparkles, AlertCircle
} from "lucide-react"
import { toggleFollowCreatorHome, toggleBookmarkArticleHome } from "./actions"
import { cn } from "@/lib/utils"

interface Author {
  id: string
  name: string | null
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
  published: boolean
  isPremium: boolean
  readingTime: number
  createdAt: Date | string
  author: Author
  category: { name: string } | null
}

interface FeedDashboardProps {
  dbUser: {
    id: string
    name: string | null
    email: string
    walletBalanceCents: number
    onboardingText: string | null
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
  // Navigation & feed tab states
  // 'recommandation' | 'abonnement' | 'decouvrir' | 'bookmarks' | 'following_creators' | 'notifications'
  const [activeFeed, setActiveFeed] = useState<string>("recommandation")
  
  // Interactive client-side states for mutations
  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks)
  const [followedCreators, setFollowedCreators] = useState<any[]>(initialFollowedCreators)
  const [followsCount, setFollowsCount] = useState<number>(initialFollowsCount)
  const [bookmarksCount, setBookmarksCount] = useState<number>(initialBookmarksCount)
  
  // Tag filter state
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  
  // Composer states
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false)
  const [postText, setPostText] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<string>("Général")
  const [localPosts, setLocalPosts] = useState<Article[]>([])
  
  // Notification states
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Marc Dutronc a publié 'Souveraineté Numérique en Europe'", time: "Il y a 5 min", unread: true },
    { id: 2, text: "Votre note sur 'L'éveil de l'IA' a été synchronisée", time: "Il y a 2h", unread: false },
  ])

  // Mutation action handlers
  const handleFollowToggle = async (creator: any) => {
    const res = await toggleFollowCreatorHome(creator.id)
    if (res.success) {
      if (res.followed) {
        setFollowedCreators(prev => [creator, ...prev])
        setFollowsCount(prev => prev + 1)
      } else {
        setFollowedCreators(prev => prev.filter(f => f.id !== creator.id))
        setFollowsCount(prev => Math.max(0, prev - 1))
      }
    }
  }

  const handleBookmarkToggle = async (article: Article) => {
    const res = await toggleBookmarkArticleHome(article.id)
    if (res.success) {
      if (res.bookmarked) {
        setBookmarks(prev => [article, ...prev])
        setBookmarksCount(prev => prev + 1)
      } else {
        setBookmarks(prev => prev.filter(b => b.id !== article.id))
        setBookmarksCount(prev => Math.max(0, prev - 1))
      }
    }
  }

  // Check states
  const isCreatorFollowed = (creatorId: string) => followedCreators.some(f => f.id === creatorId)
  const isArticleBookmarked = (articleId: string) => bookmarks.some(b => b.id === articleId)

  // Composer submit
  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!postText.trim() || !dbUser) return

    const newPost: Article = {
      id: `local-${Date.now()}`,
      title: "Pensée fugitive",
      slug: `pensée-${Date.now()}`,
      content: postText,
      published: true,
      isPremium: false,
      readingTime: 1,
      createdAt: new Date().toISOString(),
      author: {
        id: dbUser.id,
        name: dbUser.name || "Lecteur",
        subdomain: "lecteur",
        customDomain: null,
        logoUrl: null,
        heroText: "Lecteur Souverain"
      },
      category: { name: selectedCategory }
    }

    setLocalPosts(prev => [newPost, ...prev])
    setPostText("")
    setIsComposerExpanded(false)
  }

  // Prepend tags in composer
  const insertHashtag = (tag: string) => {
    setPostText(prev => prev + (prev ? " " : "") + tag)
  }

  // Resolve current active feed list
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

    // Apply tag filter
    if (selectedTag) {
      list = list.filter(art => 
        art.title.toLowerCase().includes(selectedTag.toLowerCase()) || 
        art.content.toLowerCase().includes(selectedTag.toLowerCase()) || 
        (art.category && art.category.name.toLowerCase() === selectedTag.toLowerCase())
      )
    }

    return list
  }, [activeFeed, localPosts, recommendationArticles, followingArticles, discoverArticles, bookmarks, selectedTag, followedCreators])

  // Hashtags list
  const tagsList = ["#souverainete", "#anti-ia", "#attention", "#philosophie", "#design", "#creators"]

  // Morphing springs configs
  const springTransition = { type: "spring", stiffness: 350, damping: 30 }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans pb-16 selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Sleek vertical capsule sidebar                              */}
          {/* ========================================================================= */}
          <div className="lg:col-span-3 lg:sticky lg:top-24 space-y-4">
            <div className="bg-neutral-100/70 border border-neutral-200/50 rounded-[32px] p-5 flex flex-col justify-between min-h-[calc(100vh-130px)] shadow-xs">
              
              <div className="space-y-6">
                {/* Feeds Switch */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block px-3 mb-2.5">
                    Choisir le Flux
                  </span>
                  <div className="space-y-1 relative">
                    {[
                      { id: "recommandation", label: "Recommandation", count: recommendationArticles.length },
                      { id: "abonnement", label: "Abonnement", count: followingArticles.length },
                      { id: "decouvrir", label: "Découvrir", count: discoverArticles.length }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveFeed(tab.id)
                          setSelectedTag(null)
                        }}
                        className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center justify-between group"
                      >
                        {activeFeed === tab.id && (
                          <motion.div
                            layoutId="activeFeedHighlight"
                            transition={springTransition}
                            className="absolute inset-0 bg-white border border-neutral-200/60 rounded-2xl shadow-sm -z-10"
                          />
                        )}
                        <span className={cn(
                          "transition-colors", 
                          activeFeed === tab.id ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-900"
                        )}>
                          {tab.label}
                        </span>
                        {tab.count > 0 && (
                          <span className={cn(
                            "text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors",
                            activeFeed === tab.id 
                              ? "bg-[#EE4B2B]/5 border-[#EE4B2B]/20 text-[#EE4B2B]" 
                              : "bg-neutral-200/50 border-neutral-300/30 text-neutral-400 group-hover:text-neutral-500"
                          )}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Library Navigation */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block px-3 mb-2.5">
                    Mon Sanctuaire
                  </span>
                  <div className="space-y-1">
                    {[
                      { id: "bookmarks", label: "Mes Signets", icon: BookMarked, count: bookmarksCount },
                      { id: "following_creators", label: "Mes Suivis", icon: Users, count: followsCount },
                      { id: "notifications", label: "Notifications", icon: Bell, count: notifications.filter(n => n.unread).length }
                    ].map(tab => {
                      const Icon = tab.icon
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setActiveFeed(tab.id)
                            setSelectedTag(null)
                          }}
                          className="relative z-10 w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center justify-between group"
                        >
                          {activeFeed === tab.id && (
                            <motion.div
                              layoutId="activeFeedHighlight"
                              transition={springTransition}
                              className="absolute inset-0 bg-white border border-neutral-200/60 rounded-2xl shadow-sm -z-10"
                            />
                          )}
                          <span className={cn(
                            "flex items-center gap-2 transition-colors",
                            activeFeed === tab.id ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-900"
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                            <span>{tab.label}</span>
                          </span>
                          {tab.count > 0 && (
                            <span className={cn(
                              "text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors",
                              activeFeed === tab.id 
                                ? "bg-[#EE4B2B]/5 border-[#EE4B2B]/20 text-[#EE4B2B]" 
                                : "bg-neutral-200/50 border-neutral-300/30 text-neutral-400 group-hover:text-neutral-500"
                            )}>
                              {tab.count}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Sidebar bottom */}
              <div className="space-y-4 pt-6 border-t border-neutral-200/50">
                {/* Wallet Balance widget */}
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center text-[#EE4B2B] shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold block leading-none">Portefeuille</span>
                      <span className="text-base font-bold font-mono text-neutral-800 block mt-1 leading-none">
                        {dbUser ? (dbUser.walletBalanceCents / 100).toFixed(2) : "0.00"} €
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.location.href = "/billing"}
                    className="w-full bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-2 rounded-xl text-xs font-bold shadow-xs shadow-[#EE4B2B]/10"
                  >
                    Recharger
                  </button>
                </div>

                {/* Profile menu */}
                <button
                  onClick={() => window.location.href = "/onboarding"}
                  className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white border border-transparent hover:border-neutral-200/60 hover:shadow-xs transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-full bg-[#EE4B2B]/10 border border-[#EE4B2B]/20 flex items-center justify-center font-bold text-[#EE4B2B] text-xs shrink-0">
                    {dbUser?.name?.substring(0, 2).toUpperCase() || "L"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-neutral-800 block truncate leading-tight group-hover:text-neutral-900">{dbUser?.name || "Lecteur"}</span>
                    <span className="text-[9px] text-neutral-400 block truncate mt-0.5">{dbUser?.email}</span>
                  </div>
                  <Settings className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-600 shrink-0 transition-colors" />
                </button>
              </div>

            </div>
          </div>

          {/* ========================================================================= */}
          {/* MIDDLE COLUMN: Crimson Bento Plateau enclosing composition & articles    */}
          {/* ========================================================================= */}
          <div className="lg:col-span-6 space-y-4">
            
            <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3 min-h-[calc(100vh-130px)]">
              
              {/* Card 1: Thought Composer ("Crée un post classique") */}
              {activeFeed !== "bookmarks" && activeFeed !== "following_creators" && activeFeed !== "notifications" && (
                <div className="bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100 flex flex-col gap-3 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-[#EE4B2B] text-[10px]">
                      {dbUser?.name?.charAt(0).toUpperCase() || "L"}
                    </div>
                    <span className="text-xs font-bold text-neutral-800">Crée un post classique</span>
                  </div>

                  <form onSubmit={handlePostSubmit} className="space-y-3">
                    <textarea
                      placeholder="Qu'avez-vous en tête aujourd'hui ?"
                      value={postText}
                      onChange={(e) => setPostText(e.target.value)}
                      onFocus={() => setIsComposerExpanded(true)}
                      className={cn(
                        "w-full text-sm font-sans focus:outline-none resize-none transition-all duration-300 placeholder-neutral-400 text-neutral-800 rounded-xl bg-neutral-50 border border-neutral-100 p-3",
                        isComposerExpanded ? "h-24 focus:bg-white focus:border-neutral-200" : "h-11"
                      )}
                    />

                    {/* Morphing expanding panel */}
                    <AnimatePresence>
                      {isComposerExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="flex flex-col gap-3 overflow-hidden"
                        >
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 mr-1">Hashtags:</span>
                            {tagsList.map(tag => (
                              <button
                                type="button"
                                key={tag}
                                onClick={() => insertHashtag(tag)}
                                className="text-[10px] bg-neutral-100 hover:bg-[#EE4B2B]/5 hover:text-[#EE4B2B] font-semibold px-2 py-0.5 rounded border border-neutral-200/50 transition-colors"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                            {/* Category Select */}
                            <select
                              value={selectedCategory}
                              onChange={(e) => setSelectedCategory(e.target.value)}
                              className="text-xs bg-neutral-50 hover:bg-neutral-100 font-semibold border border-neutral-200 px-3 py-1.5 rounded-xl text-neutral-600 focus:outline-none cursor-pointer"
                            >
                              <option value="Philosophie">Philosophie</option>
                              <option value="Politique">Politique</option>
                              <option value="Micro-post">Micro-post</option>
                              <option value="Souveraineté">Souveraineté</option>
                            </select>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setIsComposerExpanded(false)}
                                className="px-3.5 py-1.5 border rounded-xl text-xs font-semibold text-neutral-500 hover:bg-neutral-50"
                              >
                                Annuler
                              </button>
                              <button
                                type="submit"
                                disabled={!postText.trim()}
                                className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:border-neutral-200 disabled:shadow-none transition-colors px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                              >
                                Publier <Send className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </form>
                </div>
              )}

              {/* Feed Content */}
              <div className="flex-1 flex flex-col gap-3">
                {/* Active filter badge */}
                {selectedTag && (
                  <div className="bg-white/10 text-white rounded-[20px] px-4 py-2 text-xs flex items-center justify-between">
                    <span>Filtre actif : <strong className="font-mono">{selectedTag}</strong></span>
                    <button 
                      onClick={() => setSelectedTag(null)}
                      className="text-[10px] font-bold uppercase underline tracking-wider hover:opacity-80 transition-opacity"
                    >
                      Effacer
                    </button>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {/* Inline list of Bookmarks */}
                  {activeFeed === "bookmarks" && currentFeedArticles.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-[32px] p-12 text-center flex-1 flex flex-col items-center justify-center gap-3 text-neutral-600"
                    >
                      <BookMarked className="w-10 h-10 text-neutral-300" />
                      <h4 className="font-bold text-sm">Votre Sanctuaire est vide</h4>
                      <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                        Enregistrez des articles en cliquant sur l'icône de signet pour les conserver ici.
                      </p>
                    </motion.div>
                  )}

                  {/* Inline list of Following Creators */}
                  {activeFeed === "following_creators" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex-1 flex flex-col gap-4"
                    >
                      <div>
                        <h3 className="font-bold text-sm text-neutral-800">Médias et Créateurs Suivis</h3>
                        <p className="text-xs text-neutral-400 mt-1">Vous suivez {followedCreators.length} voix indépendantes sur la plateforme.</p>
                      </div>

                      {followedCreators.length === 0 ? (
                        <div className="text-center py-12 text-neutral-400 flex flex-col items-center gap-3">
                          <Users className="w-8 h-8 text-neutral-300" />
                          <p className="text-xs">Aucun créateur suivi pour le moment.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {followedCreators.map(creator => {
                            const host = creator.customDomain || `${creator.subdomain}.localhost:3000`
                            return (
                              <div key={creator.id} className="border border-neutral-100 rounded-2xl p-4 flex items-center justify-between gap-3 bg-neutral-50/50 hover:bg-neutral-50 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                  {creator.logoUrl ? (
                                    <img src={creator.logoUrl} className="w-10 h-10 rounded-xl object-cover border border-neutral-200/50" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {creator.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold block truncate leading-tight">{creator.name}</span>
                                    <span className="text-[10px] text-neutral-400 block truncate">@{creator.subdomain}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleFollowToggle(creator)}
                                  className="border border-[#EE4B2B]/30 hover:border-[#EE4B2B] text-neutral-500 hover:text-[#EE4B2B] font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition-all"
                                >
                                  Ne plus suivre
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Inline list of Notifications */}
                  {activeFeed === "notifications" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex-1 flex flex-col gap-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-sm text-neutral-800">Notifications</h3>
                          <p className="text-xs text-neutral-400 mt-1">Dernières activités de votre sanctuaire intellectuel.</p>
                        </div>
                        <button 
                          onClick={() => setNotifications(prev => prev.map(n => ({ ...n, unread: false })))}
                          className="text-[10px] font-bold uppercase tracking-wider text-[#EE4B2B] hover:underline"
                        >
                          Tout marquer lu
                        </button>
                      </div>

                      <div className="space-y-2">
                        {notifications.map(notif => (
                          <div key={notif.id} className={cn(
                            "p-4 rounded-2xl border flex gap-3 transition-colors",
                            notif.unread 
                              ? "bg-neutral-50/80 border-[#EE4B2B]/20" 
                              : "bg-white border-neutral-100"
                          )}>
                            <div className="mt-0.5">
                              {notif.unread ? (
                                <div className="w-2 h-2 bg-[#EE4B2B] rounded-full animate-pulse" />
                              ) : (
                                <div className="w-2 h-2 bg-neutral-200 rounded-full" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-neutral-700 leading-normal">{notif.text}</p>
                              <span className="text-[9px] text-neutral-400 font-semibold block mt-1">{notif.time}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* The Timeline articles lists */}
                  {activeFeed !== "following_creators" && activeFeed !== "notifications" && (
                    currentFeedArticles.length === 0 ? (
                      <motion.div
                        key="empty-state"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-white rounded-[32px] p-12 text-center flex-1 flex flex-col items-center justify-center gap-3 text-neutral-600"
                      >
                        <AlertCircle className="w-10 h-10 text-neutral-300" />
                        <h4 className="font-bold text-sm">Aucun article trouvé</h4>
                        <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                          Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Découvrir.
                        </p>
                      </motion.div>
                    ) : (
                      <div className="space-y-3">
                        {currentFeedArticles.map((article, idx) => {
                          const isLocal = article.id.startsWith("local-")
                          const host = article.author.customDomain || `${article.author.subdomain}.localhost:3000`
                          const url = isLocal ? "#" : `http://${host}/article/${article.slug}`
                          const isBookmarked = isArticleBookmarked(article.id)
                          const isFollowed = isCreatorFollowed(article.author.id)

                          return (
                            <motion.article
                              key={article.id}
                              initial={{ opacity: 0, y: 15 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.35, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                              className="bg-white rounded-[28px] p-5 md:p-6 shadow-xs border border-neutral-100 flex flex-col gap-4 relative group"
                            >
                              {/* Header Card */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  {article.author.logoUrl ? (
                                    <img src={article.author.logoUrl} className="w-8 h-8 rounded-lg object-cover border border-neutral-200/50" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-lg bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {article.author.name?.substring(0, 2) || "NA"}
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-neutral-800 leading-none">{article.author.name}</span>
                                      {article.author.isCertified && (
                                        <span className="bg-[#EE4B2B] text-white text-[8px] font-bold px-1 rounded">✓</span>
                                      )}
                                    </div>
                                    <span className="text-[9px] text-neutral-400 block mt-0.5">@{article.author.subdomain}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-neutral-400 font-semibold font-mono">
                                    {new Date(article.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  </span>
                                  
                                  {/* Follow toggle inside card */}
                                  {!isLocal && dbUser && dbUser.id !== article.author.id && (
                                    <button
                                      onClick={() => handleFollowToggle(article.author)}
                                      className={cn(
                                        "text-[9px] font-bold px-2 py-1 rounded-lg border transition-all",
                                        isFollowed 
                                          ? "bg-neutral-100 border-neutral-200 text-neutral-500" 
                                          : "bg-[#EE4B2B]/5 border-[#EE4B2B]/20 text-[#EE4B2B] hover:bg-[#EE4B2B] hover:text-white"
                                      )}
                                    >
                                      {isFollowed ? <UserCheck className="w-2.5 h-2.5" /> : <UserPlus className="w-2.5 h-2.5" />}
                                    </button>
                                  )}

                                  {/* Bookmark toggle inside card */}
                                  {!isLocal && (
                                    <button
                                      onClick={() => handleBookmarkToggle(article)}
                                      className={cn(
                                        "text-[9px] font-bold p-1 rounded-lg border transition-all",
                                        isBookmarked 
                                          ? "bg-[#EE4B2B]/10 border-[#EE4B2B]/30 text-[#EE4B2B]" 
                                          : "bg-neutral-50 border-neutral-200 text-neutral-400 hover:text-[#EE4B2B]"
                                      )}
                                    >
                                      <Bookmark className="w-2.5 h-2.5 fill-current" style={{ fillOpacity: isBookmarked ? 1 : 0 }} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Content block */}
                              <div>
                                {isLocal ? (
                                  <div className="text-sm text-neutral-700 leading-relaxed font-serif italic">
                                    "{article.content}"
                                  </div>
                                ) : (
                                  <a href={url} target="_blank" className="block group/title">
                                    <h3 className="text-base font-bold text-neutral-800 tracking-tight leading-snug group-hover/title:text-[#EE4B2B] transition-colors mb-2">
                                      {article.title}
                                    </h3>
                                    <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">
                                      {article.content.replace(/<[^>]*>?/gm, "").substring(0, 150)}...
                                    </p>
                                  </a>
                                )}
                              </div>

                              {/* Footer Card */}
                              <div className="flex items-center justify-between pt-3 border-t border-neutral-50 mt-1">
                                <div className="flex items-center gap-2">
                                  {article.category && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 border rounded text-neutral-500">
                                      {article.category.name}
                                    </span>
                                  )}
                                  {article.isPremium && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[#EE4B2B]/10 border border-[#EE4B2B]/20 rounded text-[#EE4B2B]">
                                      Premium • 2,00 €
                                    </span>
                                  )}
                                </div>

                                {!isLocal && (
                                  <a
                                    href={url}
                                    target="_blank"
                                    className="text-[10px] font-bold text-[#EE4B2B] flex items-center gap-0.5 hover:underline"
                                  >
                                    Lire l'article <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>

                            </motion.article>
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
          {/* RIGHT COLUMN: Red Bento Plateau widget panel                              */}
          {/* ========================================================================= */}
          <div className="lg:col-span-3 lg:sticky lg:top-24 space-y-4">
            
            <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl flex flex-col gap-3">
              
              {/* Card 1: Popular Hashtags */}
              <div className="bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-3 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-[#EE4B2B]" /> Populaires & Hashtags
                </span>
                
                <div className="flex flex-wrap gap-1.5">
                  {tagsList.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                      className={cn(
                        "text-[10px] font-bold px-2.5 py-1 rounded-xl transition-all border",
                        selectedTag === tag
                          ? "bg-[#EE4B2B] border-[#EE4B2B] text-white shadow-xs"
                          : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-700"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card 2: Actualités (Platform updates) */}
              <div className="bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-3.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#EE4B2B]" /> Actualité & Souveraineté
                </span>
                
                <div className="space-y-3.5">
                  {[
                    { title: "Calibrage vectoriel", desc: "L'Algorithme de Sérendipité pgvector a été synchronisé.", date: "Aujourd'hui" },
                    { title: "Sanctuaire Attentionnel", desc: "Déploiement du carnet de notes monastique finalisé.", date: "Hier" },
                    { title: "Croissance", desc: "QOE.FI dépasse les 10 000 lecteurs mensuels souverains.", date: "24 Mai" }
                  ].map((news, i) => (
                    <div key={i} className="flex flex-col gap-1 border-l-2 border-[#EE4B2B]/20 hover:border-[#EE4B2B] pl-2.5 transition-colors">
                      <span className="text-[9px] text-neutral-400 font-bold block">{news.date}</span>
                      <span className="text-xs font-bold text-neutral-800 leading-tight block">{news.title}</span>
                      <span className="text-[10px] text-neutral-500 leading-relaxed block">{news.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested creators discovery (if not empty) */}
              {suggestedCreators.length > 0 && (
                <div className="bg-white rounded-[32px] p-5 shadow-xs border border-neutral-100">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block mb-3.5 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#EE4B2B]" /> À Découvrir
                  </span>
                  
                  <div className="space-y-3">
                    {suggestedCreators.map(creator => {
                      const host = creator.customDomain || `${creator.subdomain}.localhost:3000`
                      return (
                        <div key={creator.id} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {creator.logoUrl ? (
                              <img src={creator.logoUrl} className="w-8 h-8 rounded-lg object-cover border border-neutral-200/50 shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-[10px] text-[#EE4B2B] shrink-0">
                                {creator.name?.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-bold block leading-none truncate">{creator.name}</span>
                              <span className="text-[9px] text-neutral-400 block truncate mt-0.5">@{creator.subdomain}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleFollowToggle(creator)}
                            className="bg-[#EE4B2B]/5 hover:bg-[#EE4B2B] hover:text-white border border-[#EE4B2B]/20 text-[#EE4B2B] font-bold text-[9px] px-2.5 py-1 rounded-xl transition-all shrink-0"
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
      </div>
    </div>
  )
}
