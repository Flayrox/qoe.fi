"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, Lock, ShieldAlert, Eye, Globe, HelpCircle, Wallet, 
  CreditCard, Download, Mail, Plus, Trash, Activity, 
  Check, AlertCircle, ArrowRight, Sparkles, Sliders, Camera, Loader2
} from "lucide-react"
import { 
  updateProfile, upgradeToCreator, updateNewsletterPreferences, 
  updateSecurityEmail, updateSecurityPassword, exportUserData,
  addMutedWord, removeMutedWord
} from "./actions"
import { setLanguage } from "@/tolgee/language"
import { useTolgee } from "@tolgee/react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

interface SettingsDashboardProps {
  dbUser: {
    id: string
    name: string | null
    email: string
    username: string | null
    role: string
    logoUrl: string | null
    onboardingText: string | null
    walletBalanceCents: number
    subdomain: string | null
  }
  subscriptions: Array<{
    creator: {
      id: string
      name: string | null
      subdomain: string | null
      customDomain: string | null
      logoUrl: string | null
    }
    receiveArticles: boolean
    receivePosts: boolean
    isPremium: boolean
  }>
  walletTransactions: Array<{
    id: string
    amountCents: number
    type: string
    createdAt: string
  }>
  mutedWords: Array<{
    id: string
    word: string
  }>
  blockedUsers: Array<{
    id: string
    createdAt: string
    user: {
      id: string
      name: string | null
      email: string
      username: string | null
    }
  }>
}

export function SettingsDashboard({
  dbUser,
  subscriptions: initialSubscriptions,
  walletTransactions,
  mutedWords: initialMutedWords,
  blockedUsers
}: SettingsDashboardProps) {
  const router = useRouter()
  const tolgee = useTolgee()
  const currentLanguage = tolgee.getLanguage()

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("compte")

  // Form states
  const [name, setName] = useState(dbUser.name || "")
  const [username, setUsername] = useState(dbUser.username || "")
  const [avatarUrl, setAvatarUrl] = useState(dbUser.logoUrl || "")
  const [bio, setBio] = useState(dbUser.onboardingText || "")
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Security states
  const [newEmail, setNewEmail] = useState(dbUser.email)
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Upgrade state
  const [subdomain, setSubdomain] = useState("")
  const [upgradeMsg, setUpgradeMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState(false)

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions)
  const [subMsg, setSubMsg] = useState<string | null>(null)

  // Muted words state
  const [mutedWords, setMutedWords] = useState(initialMutedWords)
  const [newMutedWord, setNewMutedWord] = useState("")

  // GDPR export state
  const [gdprLoading, setGdprLoading] = useState(false)

  // Accessibility/Localstorage settings state (loaded client-side)
  const [dyslexicMode, setDyslexicMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dyslexic-mode") === "true"
    }
    return false
  })
  
  const [forceLightTheme, setForceLightTheme] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("force-light-theme") === "true"
    }
    return false
  })

  const [fontSize, setFontSize] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("font-size-preference") || "normal"
    }
    return "normal"
  })

  // Tab definitions
  const tabs = [
    { id: "compte", label: "Votre Compte", icon: User },
    { id: "securite", label: "Sécurité & Accès", icon: Lock },
    { id: "abonnements", label: "Portefeuille & Abonnements", icon: CreditCard },
    { id: "confidentialite", label: "Confidentialité & Blocages", icon: ShieldAlert },
    { id: "accessibilite", label: "Affichage & Langues", icon: Sliders },
    { id: "aide", label: "Aide & Ressources", icon: HelpCircle }
  ]

  // Handlers
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    const res = await updateProfile({ name, username, avatarUrl, bio })
    setProfileLoading(false)
    if (res.success) {
      setProfileMsg({ type: "success", text: "Profil mis à jour avec succès !" })
      router.refresh()
    } else {
      setProfileMsg({ type: "error", text: res.error === "USERNAME_TAKEN" ? "Ce nom d'utilisateur est déjà pris." : "Une erreur est survenue lors de l'enregistrement." })
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newEmail === dbUser.email) return
    setEmailLoading(true)
    setEmailMsg(null)
    const res = await updateSecurityEmail(newEmail)
    setEmailLoading(false)
    if (res.success) {
      setEmailMsg({ type: "success", text: "Un e-mail de confirmation a été envoyé à la nouvelle adresse." })
    } else {
      setEmailMsg({ type: "error", text: res.error || "Erreur de mise à jour." })
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

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpgradeLoading(true)
    setUpgradeMsg(null)
    const res = await upgradeToCreator(subdomain)
    setUpgradeLoading(false)
    if (res.success) {
      setUpgradeMsg({ type: "success", text: "Compte créateur activé ! Redirection vers votre nouvel espace..." })
      setTimeout(() => {
        window.location.href = "/dashboard"
      }, 1500)
    } else {
      setUpgradeMsg({ 
        type: "error", 
        text: res.error === "SUBDOMAIN_TAKEN" 
          ? "Ce sous-domaine est déjà réservé." 
          : "Format de sous-domaine invalide (3 caractères min, sans caractères spéciaux)." 
      })
    }
  }

  const handleNewsletterToggle = async (creatorId: string, type: "articles" | "posts", val: boolean) => {
    const sub = subscriptions.find(s => s.creator.id === creatorId)
    if (!sub) return

    const newArticles = type === "articles" ? val : sub.receiveArticles
    const newPosts = type === "posts" ? val : sub.receivePosts

    setSubscriptions(prev => prev.map(s => {
      if (s.creator.id === creatorId) {
        return { ...s, receiveArticles: newArticles, receivePosts: newPosts }
      }
      return s
    }))

    const res = await updateNewsletterPreferences(creatorId, newArticles, newPosts)
    if (res.success) {
      setSubMsg("Préférences de messagerie enregistrées.")
      setTimeout(() => setSubMsg(null), 2000)
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

  const handleLanguageChange = async (lang: string) => {
    await setLanguage(lang)
    router.refresh()
  }

  const handleGdprExport = async () => {
    setGdprLoading(true)
    const res = await exportUserData()
    setGdprLoading(false)
    if (res.success && res.data) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2))
      const downloadAnchor = document.createElement("a")
      downloadAnchor.setAttribute("href", dataStr)
      downloadAnchor.setAttribute("download", `qoe-user-data-export-${dbUser.id}.json`)
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
    }
  }

  // Accessibility state syncs
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

  const springTransition = { type: "spring" as const, stiffness: 350, damping: 30 }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-800 transition-colors duration-300 font-sans pb-16 selection:bg-[#EE4B2B]/10 selection:text-[#EE4B2B]">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Settings Tabs Sidebar                                        */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-neutral-100/70 border border-neutral-200/50 rounded-[32px] p-5 space-y-6 shadow-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block px-3 mb-3">
                  Réglages Généraux
                </span>
                <div className="space-y-1 relative">
                  {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className="relative z-10 w-full text-left px-3.5 py-3 rounded-2xl text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group"
                      >
                        {activeTab === tab.id && (
                          <motion.div
                            layoutId="settingsTabHighlight"
                            transition={springTransition}
                            className="absolute inset-0 bg-white border border-neutral-200/60 rounded-2xl shadow-sm -z-10"
                          />
                        )}
                        <Icon className={cn(
                          "w-4 h-4 transition-colors",
                          activeTab === tab.id ? "text-[#EE4B2B]" : "text-neutral-400 group-hover:text-neutral-600"
                        )} />
                        <span className={cn(
                          "transition-colors", 
                          activeTab === tab.id ? "text-[#EE4B2B]" : "text-neutral-500 group-hover:text-neutral-900"
                        )}>
                          {tab.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200/50 text-[10px] text-neutral-400 px-3">
                <p>qoe.fi v0.2 • Sanctuaire Numérique</p>
                <p className="mt-1">Droit d'accès et portabilité conformes RGPD.</p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Crimson Bento Plateau enclosing setting cards               */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-[#EE4B2B] rounded-[40px] p-3 shadow-xl min-h-[calc(100vh-130px)] flex flex-col gap-3">
              
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
                  {/* TAB 1: VOTRE COMPTE                                                       */}
                  {/* ========================================================================= */}
                  {activeTab === "compte" && (
                    <>
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Votre Profil Lecteur</h2>
                          <p className="text-xs text-neutral-400 mt-1">Personnalisez votre identité et vos thèmes sur la plateforme.</p>
                        </div>

                        {profileMsg && (
                          <div className={cn(
                            "p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold",
                            profileMsg.type === "success" 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{profileMsg.text}</span>
                          </div>
                        )}

                        <form onSubmit={handleProfileSubmit} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Nom d'affichage</label>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Nom d'utilisateur</label>
                              <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Photo de profil</label>
                            <div className="flex items-center gap-4">
                              <div className="relative w-16 h-16 border-2 border-neutral-200/60 rounded-2xl overflow-hidden bg-neutral-100 group shrink-0 shadow-xs flex items-center justify-center">
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-lg text-neutral-400 bg-neutral-200">
                                    {name.charAt(0) || "U"}
                                  </div>
                                )}
                                
                                <label className="absolute inset-0 bg-black/40 cursor-pointer flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Camera className="w-4 h-4 text-white" />
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    disabled={uploadingAvatar}
                                    onChange={async (e) => {
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
                                          setAvatarUrl(uploadData.url)
                                        } else {
                                          alert(uploadData.error || "Une erreur est survenue lors de l'upload.")
                                        }
                                      } catch (err) {
                                        console.error(err)
                                        alert("Erreur lors de l'envoi de l'image.")
                                      } finally {
                                        setUploadingAvatar(false)
                                      }
                                    }}
                                  />
                                </label>

                                {uploadingAvatar && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={avatarUrl}
                                  placeholder="URL de l'image ou téléversez-en une..."
                                  onChange={(e) => setAvatarUrl(e.target.value)}
                                  className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                                />
                                <span className="text-[9px] text-neutral-400 block px-1">Survolez le carré à gauche pour importer directement un fichier.</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">ADN Lecteur (Biographie)</label>
                            <textarea
                              value={bio}
                              rows={4}
                              placeholder="Décrivez vos lectures idéales pour calibrer le matching vectoriel pgvector."
                              onChange={(e) => setBio(e.target.value)}
                              className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl p-3 resize-none"
                            />
                          </div>

                          <div className="flex justify-end pt-2">
                            <button
                              type="submit"
                              disabled={profileLoading}
                              className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:opacity-50 transition-colors px-4 py-2.5 rounded-xl text-xs font-bold"
                            >
                              {profileLoading ? "Enregistrement..." : "Sauvegarder les modifications"}
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Adresse de Messagerie</h2>
                          <p className="text-xs text-neutral-400 mt-1">Modifiez l'adresse e-mail de connexion à votre compte.</p>
                        </div>

                        {emailMsg && (
                          <div className={cn(
                            "p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold",
                            emailMsg.type === "success" 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                              : "bg-red-50 border-red-200 text-red-700"
                          )}>
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{emailMsg.text}</span>
                          </div>
                        )}

                        <form onSubmit={handleEmailSubmit} className="flex gap-3">
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="flex-1 text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                            required
                          />
                          <button
                            type="submit"
                            disabled={emailLoading || newEmail === dbUser.email}
                            className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:border-neutral-200 transition-colors px-4 py-2.5 rounded-xl text-xs font-bold shrink-0"
                          >
                            {emailLoading ? "Mise à jour..." : "Modifier l'email"}
                          </button>
                        </form>
                      </div>

                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-5">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Données Personnelles (RGPD)</h2>
                          <p className="text-xs text-neutral-400 mt-1">Conformément au RGPD européen, téléchargez une copie complète de vos données au format portable JSON.</p>
                        </div>

                        <div className="bg-neutral-50 border border-neutral-200/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex gap-3">
                            <div className="w-9 h-9 bg-neutral-200 rounded-xl flex items-center justify-center text-neutral-500 shrink-0">
                              <Download className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-neutral-700 block">Fichier qoe-user-data.json</span>
                              <span className="text-[10px] text-neutral-400 block mt-0.5">Inclut profil, bookmarks, highlights, abonnements et transactions.</span>
                            </div>
                          </div>
                          <button
                            onClick={handleGdprExport}
                            disabled={gdprLoading}
                            className="bg-neutral-800 text-white hover:bg-neutral-900 transition-colors px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 flex items-center justify-center gap-1.5"
                          >
                            {gdprLoading ? "Préparation..." : "Exporter mes données"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 2: SECURITE                                                           */}
                  {/* ========================================================================= */}
                  {activeTab === "securite" && (
                    <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Changement de Mot de Passe</h2>
                        <p className="text-xs text-neutral-400 mt-1">Configurez un nouveau mot de passe fort pour sécuriser votre compte.</p>
                      </div>

                      {passwordMsg && (
                        <div className={cn(
                          "p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold",
                          passwordMsg.type === "success" 
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                            : "bg-red-50 border-red-200 text-red-700"
                        )}>
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{passwordMsg.text}</span>
                        </div>
                      )}

                      <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Nouveau mot de passe</label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                            required
                            minLength={6}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block px-1">Confirmer le mot de passe</label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                            required
                          />
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={passwordLoading}
                            className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:opacity-50 transition-colors px-4 py-2.5 rounded-xl text-xs font-bold"
                          >
                            {passwordLoading ? "Enregistrement..." : "Modifier le mot de passe"}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 3: ABONNEMENTS & NEWSLETTERS                                          */}
                  {/* ========================================================================= */}
                  {activeTab === "abonnements" && (
                    <>
                      {/* Become a creator banner */}
                      {dbUser.role === "user" ? (
                        <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#F97316]" />
                            <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Devenir Créateur Média</h2>
                          </div>
                          <p className="text-xs text-neutral-500 leading-relaxed">
                            Passez au rôle Créateur pour concevoir votre propre univers éditorial. Publiez des articles premium avec paywalls, des micro-posts, gérez une liste de diffusion de newsletters et définissez votre design system exclusif.
                          </p>

                          {upgradeMsg && (
                            <div className={cn(
                              "p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold",
                              upgradeMsg.type === "success" 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                : "bg-red-50 border-red-200 text-red-700"
                            )}>
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{upgradeMsg.text}</span>
                            </div>
                          )}

                          <form onSubmit={handleUpgradeSubmit} className="flex gap-3">
                            <div className="flex-1 relative">
                              <input
                                type="text"
                                placeholder="votre-media"
                                value={subdomain}
                                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                className="w-full text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl pl-3 pr-24 py-2.5"
                                required
                              />
                              <span className="absolute right-3 top-3 text-[10px] text-neutral-400 font-bold font-mono">
                                .qoe.fi
                              </span>
                            </div>
                            <button
                              type="submit"
                              disabled={upgradeLoading || subdomain.length < 3}
                              className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:border-neutral-200 transition-colors px-4 py-2.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1"
                            >
                              {upgradeLoading ? "Activation..." : "Activer mon média"} <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Compte Créateur Actif</h2>
                          </div>
                          <p className="text-xs text-neutral-400">Votre média est accessible à l'adresse : <strong className="font-mono text-[#EE4B2B]">{dbUser.subdomain}.qoe.fi</strong></p>
                          <button
                            onClick={() => window.location.href = "/dashboard"}
                            className="bg-neutral-800 text-white hover:bg-neutral-900 transition-colors px-4 py-2 rounded-xl text-xs font-bold self-start"
                          >
                            Aller au Dashboard Créateur
                          </button>
                        </div>
                      )}

                      {/* Newsletter Toggles (Frictionless granular choices) */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Préférences de Messagerie</h2>
                            <p className="text-xs text-neutral-400 mt-1">Sélectionnez les contenus que vous souhaitez recevoir par e-mail par créateur.</p>
                          </div>
                          {subMsg && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fade-in">
                              {subMsg}
                            </span>
                          )}
                        </div>

                        {subscriptions.length === 0 ? (
                          <div className="text-center py-8 text-neutral-400 text-xs border-2 border-dashed border-neutral-200 rounded-2xl p-4">
                            Vous ne suivez aucun créateur pour le moment.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {subscriptions.map(sub => (
                              <div key={sub.creator.id} className="border border-neutral-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-50/50">
                                <div className="flex items-center gap-3">
                                  {sub.creator.logoUrl ? (
                                    <img src={sub.creator.logoUrl} className="w-8 h-8 rounded-lg object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-lg bg-[#EE4B2B]/10 flex items-center justify-center font-bold text-xs text-[#EE4B2B]">
                                      {sub.creator.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs font-bold text-neutral-800 block">{sub.creator.name}</span>
                                    <span className="text-[10px] text-neutral-400 block">@{sub.creator.subdomain}</span>
                                  </div>
                                </div>

                                <div className="flex gap-4">
                                  {/* Toggle Articles */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receiveArticles}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "articles", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-neutral-300 text-[#EE4B2B] focus:ring-[#EE4B2B]/30 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-neutral-600 uppercase">Articles</span>
                                  </label>

                                  {/* Toggle Posts */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receivePosts}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "posts", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-neutral-300 text-[#EE4B2B] focus:ring-[#EE4B2B]/30 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-neutral-600 uppercase">Tweets / Posts</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Transactions History */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Historique du Portefeuille</h2>
                          <p className="text-xs text-neutral-400 mt-1">Relevé de vos transactions financières et déblocages d'articles.</p>
                        </div>

                        {walletTransactions.length === 0 ? (
                          <div className="text-center py-6 text-neutral-400 text-xs">
                            Aucune transaction répertoriée.
                          </div>
                        ) : (
                          <div className="border border-neutral-100 rounded-2xl overflow-hidden text-xs">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  <th className="p-3">Date</th>
                                  <th className="p-3">Type</th>
                                  <th className="p-3 text-right">Montant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {walletTransactions.map(tx => (
                                  <tr key={tx.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                                    <td className="p-3 text-neutral-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                    <td className="p-3 font-semibold">
                                      {tx.type === "DEPOSIT" ? "Recharge" : tx.type === "SUBSCRIPTION_PAYMENT" ? "Déblocage premium" : tx.type}
                                    </td>
                                    <td className={cn(
                                      "p-3 text-right font-bold font-mono",
                                      tx.amountCents > 0 ? "text-emerald-600" : "text-neutral-700"
                                    )}>
                                      {tx.amountCents > 0 ? "+" : ""}{(tx.amountCents / 100).toFixed(2)} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 4: PRIVACY & BLOCKAGES                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "confidentialite" && (
                    <>
                      {/* Muted words */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-5">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Mots exclus (Muted Words)</h2>
                          <p className="text-xs text-neutral-400 mt-1">Excluez du contenu de votre feed en listant des mots ou concepts spécifiques (protection de l'attention).</p>
                        </div>

                        <form onSubmit={handleAddMutedWord} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Saisissez un mot (ex: politique, football...)"
                            value={newMutedWord}
                            onChange={(e) => setNewMutedWord(e.target.value)}
                            className="flex-1 text-xs border border-neutral-200 focus:border-neutral-300 focus:outline-none bg-neutral-50/50 focus:bg-white rounded-xl px-3 py-2.5"
                          />
                          <button
                            type="submit"
                            className="bg-[#EE4B2B] text-white hover:bg-[#d63d20] transition-colors p-2.5 rounded-xl text-xs font-bold flex items-center justify-center shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </form>

                        {mutedWords.length === 0 ? (
                          <div className="text-center py-6 text-neutral-400 text-xs">
                            Aucun mot exclu pour le moment.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {mutedWords.map(w => (
                              <div key={w.id} className="text-xs bg-neutral-50 border rounded-xl px-3 py-1.5 flex items-center gap-2 font-semibold">
                                <span className="font-mono">{w.word}</span>
                                <button 
                                  onClick={() => handleRemoveMutedWord(w.id)}
                                  className="text-neutral-400 hover:text-red-500 transition-colors shrink-0"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Blocked accounts list */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Comptes Bloqués</h2>
                          <p className="text-xs text-neutral-400 mt-1">Utilisateurs bloqués que vous ne souhaitez plus voir interagir sur vos espaces.</p>
                        </div>

                        {blockedUsers.length === 0 ? (
                          <div className="text-center py-6 text-neutral-400 text-xs">
                            Aucun utilisateur bloqué.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {blockedUsers.map(b => (
                              <div key={b.id} className="border border-neutral-100 rounded-2xl p-3 flex items-center justify-between text-xs bg-neutral-50/50">
                                <div>
                                  <span className="font-bold text-neutral-800 block">{b.user.name}</span>
                                  <span className="text-[10px] text-neutral-400 block mt-0.5">@{b.user.username || b.user.email.split("@")[0]}</span>
                                </div>
                                <span className="text-[9px] text-neutral-400 font-semibold font-mono">Bloqué le {new Date(b.createdAt).toLocaleDateString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 5: ACCESSIBILITE & AFFICHAGE & LANGUES                                 */}
                  {/* ========================================================================= */}
                  {activeTab === "accessibilite" && (
                    <>
                      {/* Language Selection */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Langue de l'Interface</h2>
                          <p className="text-xs text-neutral-400 mt-1">Sélectionnez la langue par défaut de l'application.</p>
                        </div>

                        <div className="flex gap-2 bg-neutral-100 p-1 rounded-xl w-32 shrink-0">
                          <button
                            onClick={() => handleLanguageChange("fr")}
                            className={cn(
                              "text-xs font-bold flex-1 py-2 rounded-lg transition-colors",
                              currentLanguage === "fr"
                                ? "bg-white text-neutral-900 shadow-sm"
                                : "text-neutral-400 hover:text-neutral-600"
                            )}
                          >
                            Français
                          </button>
                          <button
                            onClick={() => handleLanguageChange("en")}
                            className={cn(
                              "text-xs font-bold flex-1 py-2 rounded-lg transition-colors",
                              currentLanguage === "en"
                                ? "bg-white text-neutral-900 shadow-sm"
                                : "text-neutral-400 hover:text-neutral-600"
                            )}
                          >
                            English
                          </button>
                        </div>
                      </div>

                      {/* Display Preferences */}
                      <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Préférences d'Affichage</h2>
                          <p className="text-xs text-neutral-400 mt-1">Ajustez les styles visuels pour un confort de lecture adapté.</p>
                        </div>

                        <div className="space-y-4">
                          {/* Font Size select */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
                            <div>
                              <span className="text-xs font-bold text-neutral-700 block">Taille du Texte</span>
                              <span className="text-[10px] text-neutral-400 block mt-0.5">Augmentez ou réduisez la taille globale de la typographie.</span>
                            </div>
                            <select
                              value={fontSize}
                              onChange={(e) => changeFontSize(e.target.value)}
                              className="text-xs bg-neutral-50 hover:bg-neutral-100 font-semibold border border-neutral-200 px-3 py-1.5 rounded-xl focus:outline-none cursor-pointer"
                            >
                              <option value="small">Petite</option>
                              <option value="normal">Normale</option>
                              <option value="large">Grande</option>
                              <option value="xlarge">Très Grande</option>
                            </select>
                          </div>

                          {/* Dyslexic font toggle */}
                          <div className="flex items-center justify-between gap-3 pb-4 border-b border-neutral-100">
                            <div>
                              <span className="text-xs font-bold text-neutral-700 block">Police Dyslexique</span>
                              <span className="text-[10px] text-neutral-400 block mt-0.5">Force l'utilisation d'une typographie simplifiée facilitant le décodage de lecture.</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={dyslexicMode}
                                onChange={(e) => toggleDyslexic(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
                            </label>
                          </div>

                          {/* Override creator themes */}
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-xs font-bold text-neutral-700 block">Forcer le Thème Light Standard</span>
                              <span className="text-[10px] text-neutral-400 block mt-0.5">Ignore les styles de couleur et polices personnalisés par les auteurs pour un fond blanc neutre uniforme.</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={forceLightTheme}
                                onChange={(e) => toggleForceLight(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 6: AIDE & ACCUEIL                                                     */}
                  {/* ========================================================================= */}
                  {activeTab === "aide" && (
                    <div className="bg-white rounded-[32px] p-6 shadow-xs border border-neutral-100 flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-bold text-neutral-800 tracking-tight leading-none">Centre d'Aide & Ressources</h2>
                        <p className="text-xs text-neutral-400 mt-1">Informations légales et accompagnement utilisateur.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="border border-neutral-100 rounded-2xl p-4 flex flex-col gap-1.5 hover:bg-neutral-50 transition-colors">
                          <span className="font-bold text-neutral-800">Support Technique</span>
                          <span className="text-neutral-500 leading-normal">Une question sur vos abonnements ou votre solde ? Envoyez un message à notre équipe de support technique.</span>
                          <a href="mailto:support@qoe.fi" className="text-[#EE4B2B] hover:underline font-semibold block mt-2">support@qoe.fi</a>
                        </div>

                        <div className="border border-neutral-100 rounded-2xl p-4 flex flex-col gap-1.5 hover:bg-neutral-50 transition-colors">
                          <span className="font-bold text-neutral-800">Conformité RGPD & Confidentialité</span>
                          <span className="text-neutral-500 leading-normal">Pour toute demande relative au Règlement Général sur la Protection des Données (RGPD/GDPR) ou suppression définitive.</span>
                          <a href="mailto:rgpd@qoe.fi" className="text-[#EE4B2B] hover:underline font-semibold block mt-2">dpo@qoe.fi</a>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-neutral-100 text-[10px] text-neutral-400">
                        <p className="leading-relaxed">
                          qoe.fi est conçu avec pour valeurs la protection de l'attention et la souveraineté économique des créateurs de contenu en Europe. Nous n'utilisons aucun traceur tiers publicitaire.
                        </p>
                      </div>
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>

            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
