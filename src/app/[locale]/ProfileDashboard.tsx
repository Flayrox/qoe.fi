"use client"

import React, { useState, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, BookOpen, Highlighter, Mail, Sparkles, Plus, Check,
  Camera, Lock, Globe, ArrowRight, UserPlus, UserMinus, 
  MessageSquare, Loader2, AlertCircle, X, ExternalLink, Sliders, Trash2, Download
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toggleFollowUser, sendLetter, updateAvatarDirect, fetchUserConnections, updateProfileDirect } from "./actions"
import { 
  updateSecurityPassword, 
  exportUserData, 
  addMutedWord, 
  removeMutedWord 
} from "@/app/(main)/settings/actions"

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
  initialMutedWords = [],
  linkedProviders = [],
  postsCount: initialPostsCount
}: ProfileDashboardProps) {
  const isOwnProfile = currentUserId === profileUser.id

  // Navigation states
  const [activeTab, setActiveTab] = useState<string>("pensees")
  const [isPending, startTransition] = useTransition()

  // State mutations
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [followersCount, setFollowersCount] = useState(initialFollowersCount)
  const [followingCount, setFollowingCount] = useState(initialFollowingCount)
  const [posts, setPosts] = useState(initialPosts)
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
  const [activeModalTab, setActiveModalTab] = useState<"identity" | "security" | "muted" | "preferences">("identity")
  const [editName, setEditName] = useState(profileUser.name || "")
  const [editUsername, setEditUsername] = useState(profileUser.username || "")
  const [editBio, setEditBio] = useState(profileUser.onboardingText || "")
  const [editEmail, setEditEmail] = useState(profileUser.email || "")
  const [linkedGoogle, setLinkedGoogle] = useState(linkedProviders.includes("google"))
  const [linkedApple, setLinkedApple] = useState(linkedProviders.includes("apple"))
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState("")
  const [profileSaveSuccess, setProfileSaveSuccess] = useState("")

  // Security / Settings states
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Muted words states
  const [mutedWords, setMutedWords] = useState(initialMutedWords)
  const [newMutedWord, setNewMutedWord] = useState("")

  // GDPR export state
  const [gdprLoading, setGdprLoading] = useState(false)

  // Accessibility / display preferences states
  const [dyslexicMode, setDyslexicMode] = useState<boolean>(false)
  const [forceLightTheme, setForceLightTheme] = useState<boolean>(false)
  const [fontSize, setFontSize] = useState<string>("normal")

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDyslexicMode(localStorage.getItem("dyslexic-mode") === "true")
      setForceLightTheme(localStorage.getItem("force-light-theme") === "true")
      setFontSize(localStorage.getItem("font-size-preference") || "normal")
    }
  }, [])

  const toggleDyslexic = (val: boolean) => {
    setDyslexicMode(val)
    localStorage.setItem("dyslexic-mode", String(val))
    if (val) {
      document.documentElement.classList.add("font-dyslexic")
    } else {
      document.documentElement.classList.remove("font-dyslexic")
    }
  }

  const toggleForceLight = (val: boolean) => {
    setForceLightTheme(val)
    localStorage.setItem("force-light-theme", String(val))
  }

  const changeFontSize = (val: string) => {
    setFontSize(val)
    localStorage.setItem("font-size-preference", val)
    document.documentElement.setAttribute("data-font-size", val)
  }

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
      setProfileSaveError(res.error === "USERNAME_TAKEN" ? "Ce nom d'utilisateur est déjà pris." : "Une erreur est survenue lors de l'enregistrement.")
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Les mots de passe ne correspondent pas." })
      return
    }
    setPasswordLoading(true)
    setPasswordMsg(null)
    const res = await updateSecurityPassword(password)
    setPasswordLoading(false)
    if (res.success) {
      setPasswordMsg({ type: "success", text: "Mot de passe modifié avec succès !" })
      setPassword("")
      setConfirmPassword("")
    } else {
      setPasswordMsg({ type: "error", text: res.error || "Une erreur est survenue." })
    }
  }

  const handleAddMutedWord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMutedWord.trim()) return
    const res = await addMutedWord(newMutedWord)
    if (res.success && res.muted) {
      setMutedWords(prev => [res.muted, ...prev])
      setNewMutedWord("")
    }
  }

  const handleRemoveMutedWord = async (id: string) => {
    const res = await removeMutedWord(id)
    if (res.success) {
      setMutedWords(prev => prev.filter(w => w.id !== id))
    }
  }

  const handleGdprExport = async () => {
    setGdprLoading(true)
    const res = await exportUserData()
    setGdprLoading(false)
    if (res.success && res.data) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2))
      const downloadAnchor = document.createElement("a")
      downloadAnchor.setAttribute("href", dataStr)
      downloadAnchor.setAttribute("download", `qoe-user-data-export-${profileUser.id}.json`)
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
    }
  }

  // Quick follow actions
  const handleFollowToggle = async () => {
    if (!currentUserId) {
      window.location.href = "/login"
      return
    }
    startTransition(async () => {
      const res = await toggleFollowUser(profileUser.id)
      if (res.success) {
        setIsFollowing(res.followed ?? false)
        setFollowersCount(prev => res.followed ? prev + 1 : Math.max(0, prev - 1))
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
      setLetterMsg({ type: "success", text: "Votre lettre a été expédiée avec succès !" })
      setLetterContent("")
      
      // If public, append to public letters feed locally
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
      setLetterMsg({ type: "error", text: "Impossible d'envoyer la lettre. Réessayez." })
    }
  }

  const tabs = [
    { id: "pensees", label: `Pensées (${posts.length})`, icon: MessageSquare },
    ...(articles.length > 0 ? [{ id: "articles", label: `Articles (${articles.length})`, icon: BookOpen }] : []),
    { id: "highlights", label: `Lectures (${highlights.length})`, icon: Highlighter },
    { id: "letters", label: `Correspondance (${letters.length})`, icon: Mail }
  ]

  const springTransition = { type: "spring" as const, stiffness: 350, damping: 30 }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans pb-16 selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      
      {/* ========================================================================= */}
      {/* HEADER BANNER                                                             */}
      {/* ========================================================================= */}
      <div className="relative h-48 md:h-64 bg-neutral-200 overflow-hidden border-b border-neutral-200/60 shadow-xs">
        {profileUser.headerImageUrl ? (
          <img src={profileUser.headerImageUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 via-neutral-200 to-[#EE4B2B]/10" />
            <div className="absolute inset-0 bg-[radial-gradient(#EE4B2B/0.08_1px,transparent_1px)] [background-size:20px_20px]" />
          </>
        )}
      </div>

      <div className="container mx-auto px-4 max-w-6xl -mt-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Profile info card (Bento style)                              */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-neutral-200/60 rounded-[32px] p-6 shadow-sm flex flex-col gap-6 relative">
              
              {/* Avatar section */}
              <div className="relative w-28 h-28 -mt-20 border-4 border-white rounded-[24px] shadow-md overflow-hidden bg-neutral-100 group shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={profileUser.name || "Avatar"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-neutral-400 bg-neutral-200">
                    {profileUser.name?.charAt(0) || "U"}
                  </div>
                )}
                
                {isOwnProfile && (
                  <label className="absolute inset-0 bg-black/40 cursor-pointer flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[9px] text-white font-bold uppercase mt-1">Modifier</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                  </label>
                )}
                
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Name and tags */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-xl font-bold text-neutral-800 tracking-tight leading-none">
                    {profileUser.name || "Lecteur"}
                  </h1>
                  {profileUser.isCertified && (
                    <span className="bg-[#EE4B2B]/10 text-[#EE4B2B] text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm">
                      Certifié
                    </span>
                  )}
                  {profileUser.role === 'superadmin' && (
                    <span className="bg-neutral-800 text-white text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm">
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
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#EE4B2B] hover:underline mt-1 bg-[#EE4B2B]/5 px-2.5 py-1 rounded-xl border border-[#EE4B2B]/10 w-fit"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{profileUser.subdomain}.qoe.fi</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>

              {/* Follow Stats */}
              <div className="flex items-center gap-5 border-y border-neutral-100 py-3.5 text-xs text-neutral-500 font-medium flex-wrap">
                <span>
                  <strong className="text-neutral-800 font-bold">{initialPostsCount}</strong> posts
                </span>
                <button onClick={() => openConnectionsModal("following")} className="hover:text-neutral-900 transition-colors">
                  <strong className="text-neutral-800 font-bold">{followingCount}</strong> suivis
                </button>
                <button onClick={() => openConnectionsModal("followers")} className="hover:text-neutral-900 transition-colors">
                  <strong className="text-neutral-800 font-bold">{followersCount}</strong> abonnés
                </button>
                <span className="text-[9px] text-neutral-400 font-mono ml-auto">
                  Membre depuis {new Date(profileUser.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
              </div>

              {/* Reader bio / DNA */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block">ADN de lecture</span>
                <p className="text-xs text-neutral-600 leading-relaxed font-sans">
                  {profileUser.onboardingText || "Aucune description sémantique rédigée pour le moment."}
                </p>
              </div>

              {/* Profile Edit / Follow Button Action */}
              {isOwnProfile ? (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all shadow-sm bg-neutral-900 hover:bg-neutral-800 text-white"
                >
                  <Sliders className="w-4 h-4" /> Modifier le Profil
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  disabled={isPending}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all shadow-sm",
                    isFollowing 
                      ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200" 
                      : "bg-[#EE4B2B] hover:bg-[#d63d20] text-white"
                  )}
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="w-4 h-4" /> Ne plus suivre
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> Suivre l'auteur
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Correspondence letter widget */}
            {!isOwnProfile && currentUserId && (
              <div className="bg-white border border-neutral-200/60 rounded-[32px] p-6 shadow-sm flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-neutral-800 leading-none flex items-center gap-1.5">
                    Écrire une Lettre <Sparkles className="w-3.5 h-3.5 text-[#EE4B2B]" />
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-1">Envoyez une correspondance intellectuelle à cet utilisateur.</p>
                </div>

                {letterMsg && (
                  <div className={cn(
                    "p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2",
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
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl p-3 resize-none outline-none transition-all"
                    required
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLetterIsPublic(true)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border tracking-wider transition-colors",
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
                          "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase border tracking-wider transition-colors",
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
                      className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-1.5 px-3.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50"
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
          {/* RIGHT COLUMN: Tab switcher and items grids (Enclosed in Bento coque)       */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl min-h-[calc(100vh-220px)] flex flex-col gap-3">
              
              {/* Tab Selector bar */}
              <div className="bg-white rounded-[32px] p-2 flex items-center justify-start gap-1 overflow-x-auto select-none shrink-0 shadow-xs border border-neutral-100">
                {tabs.map(tab => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="relative z-10 px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-200 flex items-center gap-2 group shrink-0"
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeProfileTabHighlight"
                          transition={springTransition}
                          className="absolute inset-0 bg-neutral-100 border border-neutral-200/50 rounded-2xl -z-10"
                        />
                      )}
                      <Icon className={cn(
                        "w-4 h-4 transition-colors",
                        activeTab === tab.id ? "text-[#EE4B2B]" : "text-neutral-400 group-hover:text-neutral-600"
                      )} />
                      <span className={cn(
                        "transition-colors",
                        activeTab === tab.id ? "text-neutral-800" : "text-neutral-500 group-hover:text-neutral-800"
                      )}>
                        {tab.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Dynamic panel content */}
              <div className="flex-1 flex flex-col gap-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="flex-1 flex flex-col gap-3"
                  >
                    
                    {/* ========================================================================= */}
                    {/* TAB: PENSÉES (Micro-posts)                                                */}
                    {/* ========================================================================= */}
                    {activeTab === "pensees" && (
                      <div className="flex flex-col gap-3">
                        {posts.length === 0 ? (
                          <div className="bg-white rounded-[32px] p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs">
                            Aucune pensée publiée pour le moment.
                          </div>
                        ) : (
                          posts.map(post => (
                            <div key={post.id} className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {post.author.logoUrl ? (
                                    <img src={post.author.logoUrl} className="w-8 h-8 rounded-xl object-cover" alt="" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {post.author.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-bold text-neutral-800 block leading-none">{post.author.name}</span>
                                      {post.author.isCertified && <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B]" />}
                                    </div>
                                    <span className="text-[10px] text-neutral-400 block mt-1 font-mono">@{post.author.username}</span>
                                  </div>
                                </div>
                                <span className="text-[9px] text-neutral-400 font-mono">{new Date(post.createdAt).toLocaleDateString()}</span>
                              </div>

                              <p className="text-xs text-neutral-700 leading-relaxed font-sans whitespace-pre-line">
                                {post.content}
                              </p>

                              {post.imageUrl && (
                                <div className="rounded-2xl border border-neutral-200/50 overflow-hidden bg-neutral-100 max-h-96">
                                  <img src={post.imageUrl} className="w-full h-full object-cover" alt="Image jointe" />
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB: ARTICLES                                                             */}
                    {/* ========================================================================= */}
                    {activeTab === "articles" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {articles.map(art => (
                          <div 
                            key={art.id} 
                            onClick={() => window.location.href = `/article/${art.slug}`}
                            className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col justify-between min-h-48 cursor-pointer hover:border-neutral-300 transition-all group"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-sm">
                                  {art.category?.name || "Général"}
                                </span>
                                <span className="text-[9px] text-neutral-400 font-semibold">{art.readingTime} min</span>
                              </div>
                              <h3 className="text-sm font-bold text-neutral-800 tracking-tight leading-snug group-hover:text-[#EE4B2B] transition-colors">
                                {art.title}
                              </h3>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t border-neutral-50 text-[10px] text-neutral-400 font-medium">
                              <span>{new Date(art.createdAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1 group-hover:text-neutral-600 transition-colors">Lire l'écrit <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" /></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB: LECTURES (Highlights)                                                */}
                    {/* ========================================================================= */}
                    {activeTab === "highlights" && (
                      <div className="flex flex-col gap-3">
                        {highlights.length === 0 ? (
                          <div className="bg-white rounded-[32px] p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs">
                            Aucun passage surligné partagé publiquement.
                          </div>
                        ) : (
                          highlights.map(h => (
                            <div key={h.id} className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                              <div className="border-l-2 border-[#EE4B2B]/60 pl-3">
                                <p className="text-xs text-neutral-700 italic leading-relaxed font-sans">
                                  “{h.text}”
                                </p>
                              </div>
                              {h.note && (
                                <p className="text-xs text-neutral-500 leading-normal pl-3">
                                  <strong>Note personnelle :</strong> {h.note}
                                </p>
                              )}
                              <div className="flex justify-between items-center text-[10px] text-neutral-400 pt-3 border-t border-neutral-50">
                                <span className="font-semibold block truncate max-w-xs">Surligné dans : {h.article.title}</span>
                                <button 
                                  onClick={() => window.location.href = `/article/${h.article.slug}`}
                                  className="text-[#EE4B2B] hover:underline font-bold flex items-center gap-1"
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
                      <div className="flex flex-col gap-3">
                        {letters.length === 0 ? (
                          <div className="bg-white rounded-[32px] p-12 text-center text-neutral-400 text-xs font-semibold shadow-xs">
                            Aucune correspondance publique n'a été échangée pour le moment.
                          </div>
                        ) : (
                          letters.map(letter => (
                            <div key={letter.id} className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {letter.sender.logoUrl ? (
                                    <img src={letter.sender.logoUrl} className="w-8 h-8 rounded-xl object-cover" alt="" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {letter.sender.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs font-bold text-neutral-800 block leading-none">{letter.sender.name}</span>
                                      {letter.sender.isCertified && <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B]" />}
                                    </div>
                                    <span className="text-[10px] text-neutral-400 block mt-1 font-mono">@{letter.sender.username}</span>
                                  </div>
                                </div>
                                <span className="text-[9px] text-neutral-400 font-mono">{new Date(letter.createdAt).toLocaleDateString()}</span>
                              </div>

                              <p className="text-xs text-neutral-700 leading-relaxed font-sans whitespace-pre-line">
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
      </div>

      {/* ========================================================================= */}
      {/* CONNECTIONS LIST MODAL OVERLAY (Followers/Following)                      */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {showConnectionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConnectionsModal(null)}
              className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs"
            />

            {/* Dialog Content */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-2xl border border-neutral-100 z-10 flex flex-col max-h-[80vh] relative"
            >
              <button 
                onClick={() => setShowConnectionsModal(null)}
                className="absolute right-5 top-5 p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-base font-bold text-neutral-800 mb-4 capitalize">
                {showConnectionsModal === "followers" ? "Ses Abonnés" : "Ses Abonnements"}
              </h2>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 custom-scrollbar min-h-[250px]">
                {loadingConnections ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 className="w-6 h-6 text-[#EE4B2B] animate-spin" />
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Chargement...</span>
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
                        window.location.href = `/@${u.username}`;
                      }}
                      className="flex items-center justify-between p-2 rounded-2xl hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {u.logoUrl ? (
                          <img src={u.logoUrl} className="w-9 h-9 rounded-xl object-cover" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                            {u.name?.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-bold text-neutral-800 block leading-tight">{u.name}</span>
                          <span className="text-[9px] text-neutral-400 block mt-0.5">@{u.username}</span>
                        </div>
                      </div>
                      
                      <button className="text-[10px] font-bold text-[#EE4B2B] bg-[#EE4B2B]/10 px-2.5 py-1 rounded-lg">
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
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xs"
            />

            {/* Dialog Content */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="bg-white w-full max-w-lg rounded-[32px] p-6 shadow-2xl border border-neutral-100 z-10 flex flex-col max-h-[90vh] relative overflow-hidden"
            >
              <button 
                onClick={() => setShowEditModal(false)}
                className="absolute right-5 top-5 p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-4">
                <h2 className="text-base font-bold text-neutral-800 flex items-center gap-1.5">
                  Modifier votre Profil <Sparkles className="w-4 h-4 text-[#EE4B2B]" />
                </h2>
                <p className="text-[10px] text-neutral-400 mt-1">Personnalisez votre identité et gérez vos comptes connectés.</p>
              </div>

              {profileSaveError && (
                <div className="mb-3.5 p-2.5 rounded-xl border border-red-200 bg-red-50 text-[11px] font-semibold text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{profileSaveError}</span>
                </div>
              )}

              {profileSaveSuccess && (
                <div className="mb-3.5 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{profileSaveSuccess}</span>
                </div>
              )}

              <form onSubmit={handleProfileSave} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                
                {/* Avatar section */}
                <div className="flex items-center gap-4 border-b border-neutral-100 pb-4">
                  <div className="relative w-16 h-16 border-2 border-neutral-200/60 rounded-2xl overflow-hidden bg-neutral-100 group shrink-0 shadow-xs flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-lg text-neutral-400 bg-neutral-200">
                        {editName.charAt(0) || "U"}
                      </div>
                    )}
                    
                    <label className="absolute inset-0 bg-black/40 cursor-pointer flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Camera className="w-4 h-4 text-white" />
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
                    <span className="text-[10px] font-bold text-neutral-500 uppercase block">Photo de profil</span>
                    <input
                      type="text"
                      value={avatarUrl}
                      placeholder="URL ou téléversez..."
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2"
                    />
                  </div>
                </div>

                {/* Identity Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Nom d'affichage</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Nom d'utilisateur</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-neutral-400 font-mono">@</span>
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl pl-6 pr-3 py-2.5 font-mono"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Adresse Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1">ADN Lecteur (Biographie)</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl p-3 resize-none h-20 outline-none"
                    placeholder="Partagez vos goûts littéraires et philosophiques..."
                  />
                </div>

                {/* Connected Accounts Section */}
                <div className="border-t border-neutral-100 pt-3.5 space-y-2.5">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Comptes Connectés</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Google Auth Link */}
                    <button
                      type="button"
                      onClick={() => setLinkedGoogle(prev => !prev)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all",
                        linkedGoogle 
                          ? "bg-neutral-50 border-neutral-200 text-neutral-700" 
                          : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-400"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02c1-2.95 3.73-5.54 6.72-5.54z"/>
                          <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.43c-.28 1.44-1.09 2.67-2.3 3.49l3.58 2.78c2.1-1.94 3.3-4.8 3.3-8.42z"/>
                          <path fill="#FBBC05" d="M5.28 14.54a7.1 7.1 0 0 1 0-4.08L1.39 7.44C.5 9.18 0 11.04 0 13c0 1.96.5 3.82 1.39 5.56l3.89-3.02z"/>
                          <path fill="#34A853" d="M12 18.96c-2.99 0-5.72-2.59-6.72-5.54L1.39 16.44C3.37 20.33 7.35 23 12 23c2.98 0 5.68-.96 7.64-2.61l-3.58-2.78c-1.12.78-2.53 1.35-4.06 1.35z"/>
                        </svg>
                        <span>Google</span>
                      </div>
                      <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold", linkedGoogle ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500")}>
                        {linkedGoogle ? "Lié" : "Associer"}
                      </span>
                    </button>

                    {/* Apple Auth Link */}
                    <button
                      type="button"
                      onClick={() => setLinkedApple(prev => !prev)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all",
                        linkedApple 
                          ? "bg-neutral-50 border-neutral-200 text-neutral-700" 
                          : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-400"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.51-.62.71-1.16 1.85-1.02 2.96 1.11.09 2.27-.58 2.97-1.41z"/>
                        </svg>
                        <span>Apple</span>
                      </div>
                      <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold", linkedApple ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500")}>
                        {linkedApple ? "Lié" : "Associer"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2.5 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-500 hover:bg-neutral-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
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
