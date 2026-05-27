"use client"

import React, { useState, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, BookOpen, Highlighter, Mail, Sparkles, Check,
  Camera, Globe, ArrowRight, UserPlus, UserMinus, 
  MessageSquare, Loader2, AlertCircle, X, ExternalLink, Sliders
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toggleFollowUser, sendLetter, updateAvatarDirect, fetchUserConnections, updateProfileDirect } from "./actions"
import { useTabStore } from "@/lib/use-tab-store"
import { MicroPostCard } from "@/components/social/MicroPostCard"

interface ProfileDashboardProps {
  profileUser: {
    id: string
    name: string | null
    email: string
    username: string | null
    role: string
    logoUrl: string | null
    heroText: string | null
    onboardingText: string | null
    isCertified: boolean
    createdAt: string
    subdomain: string | null
    headerImageUrl?: string | null
  }
  currentUserId: string | null
  isFollowing: boolean
  followersCount: number
  followingCount: number
  postsCount: number
  posts: Array<{
    id: string
    content: string
    imageUrl: string | null
    createdAt: string
    tags: string[]
    author: {
      id: string
      name: string | null
      username: string | null
      logoUrl: string | null
      isCertified: boolean
    }
  }>
  articles: Array<{
    id: string
    title: string
    slug: string
    content: string
    published: boolean
    isPremium: boolean
    readingTime: number
    createdAt: string
    category: { name: string } | null
  }>
  highlights: Array<{
    id: string
    text: string
    note: string | null
    createdAt: string
    article: {
      title: string
      slug: string
      author: { name: string | null }
    }
  }>
  letters: Array<{
    id: string
    content: string
    isPublic: boolean
    createdAt: string
    sender: {
      name: string | null
      username: string | null
      logoUrl: string | null
      isCertified: boolean
    }
  }>
  initialMutedWords?: Array<{ id: string; word: string }>
  linkedProviders?: string[]
}

// Crisp Design Engineer springs
const springs = {
  tab: { type: "spring" as const, stiffness: 450, damping: 32, mass: 0.7 },
  card: { type: "spring" as const, stiffness: 350, damping: 28 }
}

export function ProfileDashboard({
  profileUser,
  currentUserId,
  isFollowing: initialIsFollowing,
  followersCount: initialFollowersCount,
  followingCount: initialFollowingCount,
  posts: initialPosts,
  articles,
  highlights,
  letters: initialLetters,
}: ProfileDashboardProps) {
  const isOwnProfile = currentUserId === profileUser.id

  const { addTab } = useTabStore()

  // Navigation states
  const [activeTab, setActiveTab] = useState<string>("pensees")
  const [isPending, startTransition] = useTransition()

  // State mutations
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followersCount, setFollowersCount] = useState(initialFollowersCount)
  const [followingCount, setFollowingCount] = useState(initialFollowingCount)
  const [posts] = useState(initialPosts)
  const [letters, setLetters] = useState(initialLetters)

  // Image Upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profileUser.logoUrl || "")

  // Connections Overlay (Followers/Following list)
  const [showConnectionsModal, setShowConnectionsModal] = useState<"followers" | "following" | null>(null)
  const [connectionsList, setConnectionsList] = useState<any[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)

  // Letter composer state
  const [letterContent, setLetterContent] = useState("")
  const [letterIsPublic, setLetterIsPublic] = useState(true)
  const [sendingLetter, setSendingLetter] = useState(false)
  const [letterMsg, setLetterMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Profile edit states
  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState(profileUser.name || "")
  const [editUsername, setEditUsername] = useState(profileUser.username || "")
  const [editBio, setEditBio] = useState(profileUser.onboardingText || "")
  const [editEmail, setEditEmail] = useState(profileUser.email || "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState("")
  const [profileSaveSuccess, setProfileSaveSuccess] = useState("")

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileSaveError("")
    setProfileSaveSuccess("")

    const res = await updateProfileDirect({
      name: editName,
      username: editUsername,
      bio: editBio,
      email: editEmail
    })

    setSavingProfile(false)
    if (res.success) {
      setProfileSaveSuccess("Profil mis à jour avec succès !")
      setTimeout(() => {
        setProfileSaveSuccess("")
        if (editUsername !== profileUser.username) {
          window.location.href = `/@${editUsername}`
        } else {
          window.location.reload()
        }
      }, 1500)
    } else {
      setProfileSaveError(res.error === "USERNAME_TAKEN" ? "Ce nom d'utilisateur est déjà pris." : "Une erreur est survenue.")
    }
  }

  // Quick follow actions
  const handleFollowToggle = async () => {
    if (!currentUserId) {
      window.location.href = "/login"
      return
    }

    // Optimistic Update
    const previousIsFollowing = isFollowing
    const previousFollowersCount = followersCount
    
    setIsFollowing(!previousIsFollowing)
    setFollowersCount(prev => !previousIsFollowing ? prev + 1 : Math.max(0, prev - 1))

    startTransition(async () => {
      const res = await toggleFollowUser(profileUser.id)
      if (!res.success) {
        // Rollback
        setIsFollowing(previousIsFollowing)
        setFollowersCount(previousFollowersCount)
      } else {
        // Sync just in case
        setIsFollowing(res.followed ?? false)
        if (res.followed !== (!previousIsFollowing)) {
           setFollowersCount(prev => res.followed ? previousFollowersCount + 1 : Math.max(0, previousFollowersCount - 1))
        }
      }
    })
  }

  // Handle Avatar Change
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const uploadRes = await fetch("/api/articles/upload", {
        method: "POST",
        body: formData
      })
      const uploadData = await uploadRes.json()

      if (uploadRes.ok && uploadData.url) {
        const updateRes = await updateAvatarDirect(uploadData.url)
        if (updateRes.success) {
          setAvatarUrl(uploadData.url)
        }
      } else {
        alert(uploadData.error || "Une erreur est survenue lors de l'upload.")
      }
    } catch (err) {
      console.error(err)
      alert("Erreur de connexion lors du téléversement.")
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Load followers/following lists
  const openConnectionsModal = async (type: "followers" | "following") => {
    setShowConnectionsModal(type)
    setLoadingConnections(true)
    const res = await fetchUserConnections(profileUser.id, type)
    setLoadingConnections(false)
    if (res.success && res.users) {
      setConnectionsList(res.users)
    } else {
      setConnectionsList([])
    }
  }

  // Send a Correspondence Letter
  const handleSendLetter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!letterContent.trim() || !currentUserId) return

    setSendingLetter(true)
    setLetterMsg(null)
    const res = await sendLetter(profileUser.id, letterContent, letterIsPublic)
    setSendingLetter(false)

    if (res.success && res.letter) {
      setLetterMsg({ type: "success", text: "Votre lettre a été expédiée !" })
      setLetterContent("")
      
      if (letterIsPublic) {
        const newLetterObj = {
          id: res.letter.id,
          content: res.letter.content,
          isPublic: res.letter.isPublic,
          createdAt: new Date().toISOString(),
          sender: {
            name: "Vous",
            username: "vous",
            logoUrl: avatarUrl,
            isCertified: false
          }
        }
        setLetters(prev => [newLetterObj, ...prev])
      }
      setTimeout(() => setLetterMsg(null), 4000)
    } else {
      setLetterMsg({ type: "error", text: "Impossible d'envoyer la lettre." })
    }
  }

  const tabs = [
    { id: "pensees", label: `Pensées (${posts.length})`, icon: MessageSquare },
    ...(articles.length > 0 ? [{ id: "articles", label: `Articles (${articles.length})`, icon: BookOpen }] : []),
    { id: "highlights", label: `Lectures (${highlights.length})`, icon: Highlighter },
    { id: "letters", label: `Correspondance (${letters.length})`, icon: Mail }
  ]

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans pb-16 selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      
      {/* ========================================================================= */}
      {/* HEADER BANNER with razor-sharp borders                                    */}
      {/* ========================================================================= */}
      <div className="relative h-40 md:h-48 bg-neutral-200 overflow-hidden border-b border-neutral-200/40">
        {profileUser.headerImageUrl ? (
          <img src={profileUser.headerImageUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-50 via-neutral-100 to-[#EE4B2B]/5" />
            <div className="absolute inset-0 bg-[radial-gradient(#EE4B2B/0.05_1px,transparent_1px)] [background-size:20px_20px]" />
          </>
        )}
      </div>

      <div className="container mx-auto px-4 max-w-6xl -mt-14 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Profile info (Sharp Bento Card)                              */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-neutral-200/50 rounded-xl p-6 shadow-xs flex flex-col gap-6 relative">
              
              {/* Sharp avatar frame */}
              <div className="relative w-20 h-28 -mt-16 border-4 border-white rounded-xl shadow-xs overflow-hidden bg-neutral-100 group shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={profileUser.name || "Avatar"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-neutral-400 bg-neutral-200">
                    {profileUser.name?.charAt(0) || "U"}
                  </div>
                )}
                
                {isOwnProfile && (
                  <label className="absolute inset-0 bg-black/40 cursor-pointer flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera className="w-4 h-4 text-white" />
                    <span className="text-[8px] text-white font-bold uppercase mt-1">Modifier</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                  </label>
                )}
                
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Name and tags */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-sm font-semibold text-neutral-800 tracking-tight leading-none">
                    {profileUser.name || "Lecteur"}
                  </h1>
                  {profileUser.isCertified && (
                    <span className="text-[#EE4B2B] text-[10px] font-black">✓</span>
                  )}
                  {profileUser.role === 'superadmin' && (
                    <span className="bg-neutral-800 text-white text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-400 block font-mono">@{profileUser.username || "lecteur"}</span>
                
                {/* Creator site link */}
                {(profileUser.role === 'creator' || profileUser.role === 'superadmin') && profileUser.subdomain && (
                  <a
                    href={
                      typeof window !== 'undefined' && window.location.hostname.includes('localhost')
                        ? `http://${profileUser.subdomain}.localhost:3000`
                        : `https://${profileUser.subdomain}.qoe.fi`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-neutral-500 hover:text-[#EE4B2B] mt-1 bg-neutral-50 border border-neutral-200/50 px-2.5 py-1 rounded-md w-fit transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{profileUser.subdomain}.qoe.fi</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              {/* Follow Stats */}
              <div className="flex items-center gap-4 border-y border-neutral-100 py-3.5 text-xs text-neutral-500 font-semibold flex-wrap">
                <span>
                  <strong className="text-neutral-800 font-bold">{posts.length}</strong> posts
                </span>
                <button onClick={() => openConnectionsModal("following")} className="hover:text-neutral-900 transition-colors cursor-pointer">
                  <strong className="text-neutral-800 font-bold">{followingCount}</strong> suivis
                </button>
                <button onClick={() => openConnectionsModal("followers")} className="hover:text-neutral-900 transition-colors cursor-pointer">
                  <strong className="text-neutral-800 font-bold">{followersCount}</strong> abonnés
                </button>
                <span className="text-[9px] text-neutral-400 font-mono w-full mt-1.5 block">
                  Membre depuis {new Date(profileUser.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
              </div>

              {/* Reader bio / DNA */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-400 block">ADN de lecture</span>
                <p className="text-[13px] text-neutral-600 leading-relaxed font-sans">
                  {profileUser.onboardingText || "Aucune description sémantique rédigée pour le moment."}
                </p>
              </div>

              {/* Profile Edit / Follow Button Action */}
              {isOwnProfile ? (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs bg-neutral-900 hover:bg-neutral-800 text-white cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" /> Modifier le Profil
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  disabled={isPending}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer",
                    isFollowing 
                      ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200" 
                      : "bg-[#EE4B2B] hover:bg-[#d63d20] text-white"
                  )}
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="w-3.5 h-3.5" /> Ne plus suivre
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" /> Suivre l'auteur
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Correspondence letter widget */}
            {!isOwnProfile && currentUserId && (
              <div className="bg-white border border-neutral-200/50 rounded-xl p-6 shadow-xs flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-neutral-800 leading-none flex items-center gap-1.5">
                    Écrire une Lettre <Sparkles className="w-3.5 h-3.5 text-[#EE4B2B]" />
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-1.5">Envoyez une correspondance intellectuelle à cet utilisateur.</p>
                </div>

                {letterMsg && (
                  <div className={cn(
                    "p-2.5 rounded-lg border text-[11px] font-semibold flex items-center gap-2",
                    letterMsg.type === "success" 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                      : "bg-red-50 border-red-200 text-red-700"
                  )}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{letterMsg.text}</span>
                  </div>
                )}

                <form onSubmit={handleSendLetter} className="space-y-3.5">
                  <textarea
                    value={letterContent}
                    onChange={(e) => setLetterContent(e.target.value)}
                    placeholder="Écrivez vos pensées, critiques ou inspirations..."
                    rows={4}
                    maxLength={1000}
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg p-3 resize-none outline-none transition-all"
                    required
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLetterIsPublic(true)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[9px] font-bold uppercase border tracking-wider transition-colors cursor-pointer",
                          letterIsPublic 
                            ? "bg-neutral-900 border-neutral-900 text-white" 
                            : "bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600"
                        )}
                      >
                        Publique
                      </button>
                      <button
                        type="button"
                        onClick={() => setLetterIsPublic(false)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[9px] font-bold uppercase border tracking-wider transition-colors cursor-pointer",
                          !letterIsPublic 
                            ? "bg-neutral-900 border-neutral-900 text-white" 
                            : "bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600"
                        )}
                      >
                        Privée
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={sendingLetter || !letterContent.trim()}
                      className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-1.5 px-3.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {sendingLetter ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Envoi...
                        </>
                      ) : (
                        <>
                          Expédier <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Tab switcher & items (Pure flat Bento layout)               */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Tab Selector bar (sharp borders) */}
            <div className="bg-white rounded-xl p-1.5 flex items-center justify-start gap-1 overflow-x-auto select-none shrink-0 shadow-xs border border-neutral-200/50">
              {tabs.map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="relative z-10 px-4 py-2 rounded-lg text-xs font-bold transition-colors duration-200 flex items-center gap-2 group shrink-0 cursor-pointer"
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeProfileTabHighlight"
                        transition={springs.tab}
                        className="absolute inset-0 bg-neutral-50 border border-neutral-200/50 rounded-lg -z-10"
                      />
                    )}
                    <Icon className={cn(
                      "w-4 h-4 transition-colors",
                      activeTab === tab.id ? "text-[#EE4B2B]" : "text-neutral-400 group-hover:text-neutral-600"
                    )} />
                    <span className={cn(
                      "transition-colors",
                      activeTab === tab.id ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-800"
                    )}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Dynamic panel content - pure bento without heavy solid wrapping background */}
            <div className="space-y-4 min-h-[calc(100vh-220px)] flex flex-col">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="flex-1 flex flex-col gap-4"
                >
                  
                  {/* ========================================================================= */}
                  {/* TAB: PENSÉES (Micro-posts)                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "pensees" && (
                    <div className="flex flex-col gap-4">
                      {posts.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs border border-neutral-200/50">
                          Aucune pensée publiée pour le moment.
                        </div>
                      ) : (
                        posts.map(post => (
                          <MicroPostCard key={post.id} post={post} />
                        ))
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB: ARTICLES                                                             */}
                  {/* ========================================================================= */}
                  {activeTab === "articles" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {articles.map(art => (
                        <div 
                          key={art.id} 
                          onClick={() => addTab({
                            id: `article-${art.slug}`,
                            title: art.title,
                            type: "article",
                            slug: art.slug
                          })}
                          className="bg-white rounded-xl p-5 md:p-6 shadow-xs border border-neutral-200/50 flex flex-col justify-between min-h-48 cursor-pointer hover:border-[#EE4B2B]/20 transition-all duration-300 group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-50 px-2.5 py-0.5 border border-neutral-200/30 rounded font-mono">
                                {art.category?.name || "Général"}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-semibold font-mono">{art.readingTime} min</span>
                            </div>
                            <h3 className="text-sm font-semibold text-neutral-800 tracking-tight leading-snug group-hover:text-[#EE4B2B] transition-colors duration-200">
                              {art.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-neutral-100 text-[10px] text-neutral-400 font-medium font-mono">
                            <span>{new Date(art.createdAt).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1.5 group-hover:text-[#EE4B2B] transition-colors duration-200 font-sans font-semibold">Lire l'écrit <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB: LECTURES (Highlights)                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "highlights" && (
                    <div className="flex flex-col gap-4">
                      {highlights.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs border border-neutral-200/50">
                          Aucun passage surligné partagé publiquement.
                        </div>
                      ) : (
                        highlights.map(h => (
                          <div key={h.id} className="bg-white rounded-xl p-5 md:p-6 shadow-xs border border-neutral-200/50 flex flex-col gap-4 hover:border-neutral-300 transition-all duration-300">
                            <div className="border-l-2 border-[#EE4B2B] pl-3">
                              <p className="text-xs text-neutral-700 italic leading-relaxed font-sans">
                                “{h.text}”
                              </p>
                            </div>
                            {h.note && (
                              <p className="text-[13px] text-neutral-500 leading-normal pl-3">
                                <strong>Note personnelle :</strong> {h.note}
                              </p>
                            )}
                            <div className="flex justify-between items-center text-[10px] text-neutral-400 pt-3 border-t border-neutral-100 font-mono">
                              <span className="font-semibold block truncate max-w-xs font-sans text-neutral-400">Surligné dans : {h.article.title}</span>
                              <button 
                                onClick={() => addTab({
                                  id: `article-${h.article.slug}`,
                                  title: h.article.title,
                                  type: "article",
                                  slug: h.article.slug
                                })}
                                className="text-neutral-500 hover:text-[#EE4B2B] font-bold flex items-center gap-1 cursor-pointer font-sans"
                              >
                                Consulter l'article <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB: CORRESPONDANCE (Letters)                                             */}
                  {/* ========================================================================= */}
                  {activeTab === "letters" && (
                    <div className="flex flex-col gap-4">
                      {letters.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs border border-neutral-200/50">
                          Aucune correspondance publique n'a été échangée pour le moment.
                        </div>
                      ) : (
                        letters.map(letter => (
                          <div key={letter.id} className="bg-white rounded-xl p-5 md:p-6 shadow-xs border border-neutral-200/50 flex flex-col gap-4 hover:border-neutral-300 transition-all duration-300">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-md overflow-hidden border border-neutral-200/30 shrink-0">
                                  {letter.sender.logoUrl ? (
                                    <img src={letter.sender.logoUrl} className="w-full h-full object-cover" alt="" />
                                  ) : (
                                    <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {letter.sender.name?.charAt(0)}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-neutral-800 block leading-none">{letter.sender.name}</span>
                                    {letter.sender.isCertified && <span className="text-[#EE4B2B] text-[9px] font-black">✓</span>}
                                  </div>
                                  <span className="text-[10px] text-neutral-400 block mt-1 font-mono">@{letter.sender.username}</span>
                                </div>
                              </div>
                              <span className="text-[10px] text-neutral-400 font-mono">{new Date(letter.createdAt).toLocaleDateString()}</span>
                            </div>

                            <p className="text-[13px] text-neutral-700 leading-relaxed font-sans whitespace-pre-line">
                              {letter.content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONNECTIONS LIST MODAL OVERLAY (Followers/Following)                      */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showConnectionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConnectionsModal(null)}
              className="absolute inset-0 bg-neutral-900/30 backdrop-blur-xs"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="bg-white w-full max-w-md rounded-xl p-6 shadow-2xl border border-neutral-200/50 z-10 flex flex-col max-h-[80vh] relative"
            >
              <button 
                onClick={() => setShowConnectionsModal(null)}
                className="absolute right-5 top-5 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-sm font-semibold text-neutral-800 mb-4 capitalize leading-none">
                {showConnectionsModal === "followers" ? "Ses Abonnés" : "Ses Abonnements"}
              </h2>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 custom-scrollbar min-h-[250px]">
                {loadingConnections ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 className="w-5 h-5 text-[#EE4B2B] animate-spin" />
                    <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Chargement...</span>
                  </div>
                ) : connectionsList.length === 0 ? (
                  <div className="text-center py-16 text-neutral-400 text-xs">
                    Aucun utilisateur répertorié.
                  </div>
                ) : (
                  connectionsList.map(u => (
                    <div 
                      key={u.id}
                      onClick={() => {
                        setShowConnectionsModal(null);
                        addTab({
                          id: `profile-${u.username}`,
                          title: u.name || `@${u.username}`,
                          type: "profile",
                          username: u.username
                        });
                      }}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 border border-neutral-200/30">
                          {u.logoUrl ? (
                            <img src={u.logoUrl} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full bg-[#EE4B2B]/5 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                              {u.name?.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-neutral-800 block leading-tight">{u.name}</span>
                          <span className="text-[9px] text-neutral-400 block mt-0.5">@{u.username}</span>
                        </div>
                      </div>
                      
                      <button className="text-[10px] font-bold text-neutral-500 hover:text-[#EE4B2B] bg-neutral-50 hover:bg-[#EE4B2B]/5 border border-neutral-200/50 hover:border-[#EE4B2B]/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer">
                        Profil
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* EDIT PROFILE MODAL OVERLAY                                                */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-neutral-900/30 backdrop-blur-xs"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="bg-white w-full max-w-lg rounded-xl p-6 shadow-2xl border border-neutral-200/50 z-10 flex flex-col max-h-[90vh] relative overflow-hidden"
            >
              <button 
                onClick={() => setShowEditModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-4">
                <h2 className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
                  Modifier votre Profil <Sparkles className="w-4 h-4 text-[#EE4B2B]" />
                </h2>
                <p className="text-[10px] text-neutral-400 mt-1.5">Personnalisez votre identité et gérez votre correspondance.</p>
              </div>

              {profileSaveError && (
                <div className="mb-3.5 p-2.5 rounded-lg border border-red-200 bg-red-50 text-[11px] font-semibold text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{profileSaveError}</span>
                </div>
              )}

              {profileSaveSuccess && (
                <div className="mb-3.5 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{profileSaveSuccess}</span>
                </div>
              )}

              <form onSubmit={handleProfileSave} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                
                {/* Avatar section */}
                <div className="flex items-center gap-4 border-b border-neutral-100 pb-4">
                  <div className="relative w-14 h-14 border border-neutral-200/60 rounded-xl overflow-hidden bg-neutral-100 group shrink-0 shadow-xs flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-lg text-neutral-400 bg-neutral-200">
                        {editName.charAt(0) || "U"}
                      </div>
                    )}
                    
                    <label className="absolute inset-0 bg-black/40 cursor-pointer flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Camera className="w-3.5 h-3.5 text-white" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        disabled={uploadingAvatar}
                        onChange={handleAvatarUpload}
                      />
                    </label>

                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase block leading-none font-mono">Photo de profil</span>
                    <input
                      type="text"
                      value={avatarUrl}
                      placeholder="URL ou téléversez..."
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                {/* Identity Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1 font-mono">Nom d'affichage</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg px-3 py-2.5"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1 font-mono">Nom d'utilisateur</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-neutral-400 font-mono">@</span>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg pl-6 pr-3 py-2.5 font-mono"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1 font-mono">Adresse Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg px-3 py-2.5"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1 font-mono">ADN Lecteur (Biographie)</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-lg p-3 resize-none h-20 outline-none"
                    placeholder="Partagez vos goûts littéraires et philosophiques..."
                  />
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2.5 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-2.5 px-4 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {savingProfile ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement...
                      </>
                    ) : (
                      <>
                        Sauvegarder <Check className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
