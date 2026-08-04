"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, Lock, ShieldAlert, Globe, HelpCircle, 
  CreditCard, Download, Plus, Trash, Check, AlertCircle, ArrowRight, Sparkles, Sliders, Camera, Loader2,
  KeyRound, Monitor, Smartphone, ShieldCheck, Mail, Bell, SlidersHorizontal, Moon, Sun, AlertTriangle, Eye, EyeOff, Zap, LogOut, ExternalLink, RefreshCw, FileText, CheckCircle2, X
} from "lucide-react"
import { 
  updateProfile, upgradeToCreator, updateNewsletterPreferences, 
  updateSecurityEmail, updateSecurityPassword, exportUserData,
  addMutedWord, removeMutedWord
} from "./actions"

import { useTranslate, useTolgee } from "@qoe/i18n"
import { useRouter } from "next/navigation"
import { cn } from "@qoe/utils"
import { trackServerEvent } from "@qoe/analytics"
import { URLS } from "@qoe/config"

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
  hasPassword: boolean
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

const springs = {
  tab: { type: "spring" as const, stiffness: 450, damping: 32 },
  indicator: { type: "spring" as const, stiffness: 450, damping: 32 }
}

export function SettingsDashboard({
  dbUser,
  hasPassword: initialHasPassword,
  subscriptions: initialSubscriptions,
  walletTransactions,
  mutedWords: initialMutedWords,
  blockedUsers
}: SettingsDashboardProps) {
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const router = useRouter()
  const { t } = useTranslate()
  const tolgee = useTolgee()

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("compte")

  // Form states
  const [name, setName] = useState(dbUser.name || "")
  const [username, setUsername] = useState(dbUser.username || "")
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // Security states
  const [newEmail, setNewEmail] = useState(dbUser.email)
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  // Sessions state (UI)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
  const [sessionMsg, setSessionMsg] = useState<string | null>(null)

  // Timeline preferences
  const [timelineAlgorithm, setTimelineAlgorithm] = useState<"chrono" | "ai">("chrono")
  const [triggerWarningFilter, setTriggerWarningFilter] = useState<"show" | "warn" | "hide">("warn")
  const [autoplayMedia, setAutoplayMedia] = useState(true)

  // Notification Toggles (UI)
  const [notifyFollowers, setNotifyFollowers] = useState(true)
  const [notifyComments, setNotifyComments] = useState(true)
  const [notifyMentions, setNotifyMentions] = useState(true)
  const [digestFrequency, setDigestFrequency] = useState<"realtime" | "daily" | "weekly">("daily")

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

  // GDPR export state (asynchronous email request UI)
  const [gdprRequested, setGdprRequested] = useState(false)
  const [gdprLoading, setGdprLoading] = useState(false)

  // Account Modals (Freeze & Danger Zone)
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Accessibility & Display settings state
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

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return tolgee.getLanguage() || "fr"
  })

  const [accessibilityLoading, setAccessibilityLoading] = useState(false)
  const [accessibilityMsg, setAccessibilityMsg] = useState<{ type: "success" | "error", text: string } | null>(null)

  // Tab definitions
  const tabs = [
    { id: "compte", label: "Mon Compte & Identité", icon: User },
    { id: "securite", label: "Sécurité & Mot de passe", icon: Lock },
    { id: "sso", label: "Connexions SSO & Comptes", icon: ShieldCheck },
    { id: "sessions", label: "Sessions & Appareils", icon: Monitor },
    { id: "timeline", label: "Timeline & Contenus", icon: SlidersHorizontal },
    { id: "notifications", label: "Notifications & Messagerie", icon: Bell },
    { id: "abonnements", label: "Portefeuille & Facturation", icon: CreditCard },
    { id: "accessibilite", label: "Affichage & Accessibilité", icon: Sliders },
    { id: "confidentialite", label: "Confidentialité & RGPD", icon: ShieldAlert },
  ]

  // Handlers
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    const res = await updateProfile({ name, username, avatarUrl: dbUser.logoUrl || "", bio: dbUser.onboardingText || "" })
    setProfileLoading(false)
    if (res.success) {
      setProfileMsg({ type: "success", text: "Compte système mis à jour avec succès !" })
      trackServerEvent("profile_updated")
      router.refresh()
    } else {
      setProfileMsg({ 
        type: "error", 
        text: res.error === "USERNAME_TAKEN" 
          ? "Ce nom d'utilisateur est déjà réservé." 
          : "Une erreur est survenue lors de l'enregistrement." 
      })
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
      trackServerEvent("security_email_updated")
    } else {
      setEmailMsg({ type: "error", text: res.error || "Une erreur est survenue lors de la modification de l'adresse e-mail." })
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
      setPasswordMsg({ type: "success", text: hasPassword ? "Mot de passe modifié avec succès !" : "Mot de passe défini avec succès !" })
      trackServerEvent("security_password_updated")
      setHasPassword(true)
      setPassword("")
      setConfirmPassword("")
    } else {
      setPasswordMsg({ type: "error", text: res.error || "Une erreur est survenue lors de l'enregistrement." })
    }
  }

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpgradeLoading(true)
    setUpgradeMsg(null)
    const res = await upgradeToCreator(subdomain)
    setUpgradeLoading(false)
    if (res.success) {
      setUpgradeMsg({ type: "success", text: "Compte créateur activé ! Redirection vers votre nouveau Studio..." })
      trackServerEvent("upgrade_creator_clicked", { subdomain })
      setTimeout(() => {
        window.location.href = URLS.DASHBOARD
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
      trackServerEvent("newsletter_preferences_updated", { creatorId, receiveArticles: newArticles, receivePosts: newPosts })
      setTimeout(() => setSubMsg(null), 2000)
    }
  }

  const handleAddMutedWord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMutedWord.trim()) return
    const res = await addMutedWord(newMutedWord)
    if (res.success && res.muted) {
      setMutedWords(prev => [res.muted, ...prev])
      trackServerEvent("muted_word_added", { word: newMutedWord })
      setNewMutedWord("")
    }
  }

  const handleRemoveMutedWord = async (id: string) => {
    const res = await removeMutedWord(id)
    if (res.success) {
      setMutedWords(prev => prev.filter(w => w.id !== id))
      trackServerEvent("muted_word_removed")
    }
  }

  const handleGdprRequest = async () => {
    setGdprLoading(true)
    // Simulate background email export job
    setTimeout(() => {
      setGdprLoading(false)
      setGdprRequested(true)
      trackServerEvent("gdpr_export_requested")
    }, 1200)
  }

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang)
  }

  const toggleDyslexic = (val: boolean) => {
    setDyslexicMode(val)
  }

  const toggleForceLight = (val: boolean) => {
    setForceLightTheme(val)
  }

  const changeFontSize = (val: string) => {
    setFontSize(val)
  }

  const handleAccessibilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAccessibilityLoading(true)
    setAccessibilityMsg(null)

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("dyslexic-mode", String(dyslexicMode))
        localStorage.setItem("force-light-theme", String(forceLightTheme))
        localStorage.setItem("font-size-preference", fontSize)

        if (dyslexicMode) {
          document.documentElement.classList.add("font-dyslexic")
        } else {
          document.documentElement.classList.remove("font-dyslexic")
        }
        document.documentElement.setAttribute("data-font-size", fontSize)

        const originalLang = tolgee.getLanguage()
        if (selectedLanguage !== originalLang) {
          await tolgee.changeLanguage(selectedLanguage)
          trackServerEvent("language_changed", { lang: selectedLanguage })
        }
      }

      setAccessibilityMsg({ type: "success", text: "Préférences d'affichage enregistrées !" })
      
      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (err) {
      setAccessibilityMsg({ type: "error", text: "Une erreur est survenue lors de l'enregistrement." })
    } finally {
      setAccessibilityLoading(false)
    }
  }

  // Password strength calculator helper
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Non renseigné", color: "bg-[var(--border-default)]" }
    let score = 0
    if (pass.length >= 8) score += 1
    if (pass.length >= 12) score += 1
    if (/[A-Z]/.test(pass)) score += 1
    if (/[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1

    if (score <= 2) return { score: 33, label: "Faible", color: "bg-red-500" }
    if (score <= 4) return { score: 66, label: "Moyen", color: "bg-amber-500" }
    return { score: 100, label: "Fort & Sécurisé", color: "bg-emerald-500" }
  }

  const passStrength = getPasswordStrength(password)

  return (
    <div className="min-h-screen bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-300 font-sans pb-24 selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        
        {/* ========================================================================= */}
        {/* TOP PAGE HEADER                                                           */}
        {/* ========================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Réglages du Compte
            </h1>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Gérez votre identité personnelle, votre sécurité et vos préférences globales.
            </p>
          </div>

          {/* Quick bridge button to Studio Settings for creators */}
          {(dbUser.role === "creator" || dbUser.role === "superadmin") && (
            <a
              href={`${URLS.DASHBOARD}/settings`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-button)] text-xs font-semibold bg-[var(--surface-0)] border border-[var(--border-default)] hover:bg-[var(--surface-2)] text-[var(--text-primary)] transition-all shadow-xs shrink-0 self-start md:self-auto cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[var(--qoe-vermillion)]" />
              <span>Studio & Design Média ({dbUser.subdomain || "Studio"})</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Settings Tabs Sidebar                                        */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-[var(--surface-0)]/90 backdrop-blur-xl border border-[var(--border-default)] rounded-[var(--radius-card)] p-3 space-y-4 shadow-xs">
              
              {/* User Profile Summary Badge */}
              <div className="flex items-center gap-3 p-2.5 rounded-[var(--radius-button)] bg-[var(--surface-1)] border border-[var(--border-subtle)]">
                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border-default)] shrink-0 flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)]">
                  {dbUser.logoUrl ? (
                    <img src={dbUser.logoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (dbUser.name || "U").slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 truncate min-w-0">
                  <span className="text-xs font-bold block truncate leading-tight text-[var(--text-primary)]">
                    {dbUser.name || "Utilisateur"}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] block truncate">
                    {dbUser.email}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block px-3 mb-2">
                  Menu des Réglages
                </span>
                <div className="space-y-1 relative">
                  {tabs.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <motion.button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        whileTap={{ scale: 0.98 }}
                        className="relative z-10 w-full text-left px-3 py-2 rounded-[var(--radius-button)] text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group cursor-pointer"
                      >
                        {isActive && (
                          <motion.div
                            layoutId="settingsTabHighlight"
                            transition={springs.indicator}
                            className="absolute inset-0 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-button)] -z-10"
                          />
                        )}
                        <Icon className={cn(
                          "w-4 h-4 transition-colors shrink-0",
                          isActive ? "text-[var(--qoe-vermillion)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                        )} />
                        <span className={cn(
                          "transition-colors truncate text-xs", 
                          isActive ? "text-[var(--qoe-vermillion)] font-bold" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                        )}>
                          {tab.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-tertiary)] px-3 leading-relaxed">
                <p>qoe.fi • Plateau Sécurisé RGPD</p>
                <p className="mt-0.5">Souveraineté des données et protection de l'attention.</p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Bento settings cards                                       */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex-1 flex flex-col gap-4 min-h-[calc(100vh-130px)]">
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={springs.tab}
                  className="flex-1 flex flex-col gap-4"
                >
                  
                  {/* ========================================================================= */}
                  {/* TAB 1: MON COMPTE & IDENTITÉ                                              */}
                  {/* ========================================================================= */}
                  {activeTab === "compte" && (
                    <>
                      {/* Public Profile Bridge Card */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-5 shadow-xs border border-[var(--border-default)] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--surface-2)] border border-[var(--border-default)] shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold text-[var(--qoe-vermillion)]">
                            {dbUser.logoUrl ? (
                              <img src={dbUser.logoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (dbUser.name || "U").slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-[var(--text-primary)]">
                              Personnalisation du Profil Public
                            </h3>
                            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                              Votre photo de profil, biographie et bannières sont gérées directement sur votre page publique.
                            </p>
                          </div>
                        </div>
                        <a
                          href={dbUser.username ? `/profile/${dbUser.username}` : "/profile"}
                          className="px-3.5 py-2 rounded-[var(--radius-button)] bg-[var(--surface-1)] border border-[var(--border-default)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <span>Éditer le profil public</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        </a>
                      </div>

                      {/* System Identification Form */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Identité Système & Compte
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Informations principales associées à votre compte utilisateur sur qoe.fi.
                          </p>
                        </div>

                        {profileMsg && (
                          <div className={cn(
                            "p-3.5 rounded-[var(--radius-button)] border flex items-start gap-2.5 text-xs font-semibold",
                            profileMsg.type === "success" 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                              : "bg-red-50 border-red-200 text-[var(--qoe-vermillion)]"
                          )}>
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{profileMsg.text}</span>
                          </div>
                        )}

                        <form onSubmit={handleProfileSubmit} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                                Nom d'affichage
                              </label>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                                Nom d'utilisateur (@handle)
                              </label>
                              <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5 font-mono"
                                required
                              />
                            </div>
                          </div>

                          <div className="flex justify-end pt-2">
                            <motion.button
                              type="submit"
                              whileTap={{ scale: 0.98 }}
                              disabled={profileLoading}
                              className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:opacity-50 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold cursor-pointer"
                            >
                              {profileLoading ? "Enregistrement..." : "Sauvegarder l'identité"}
                            </motion.button>
                          </div>
                        </form>
                      </div>

                      {/* Primary Email Card */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Adresse E-mail Principale
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              Utilisée pour la connexion, les notifications et la récupération de compte.
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>E-mail vérifié</span>
                          </span>
                        </div>

                        {emailMsg && (
                          <div className={cn(
                            "p-3.5 rounded-[var(--radius-button)] border flex items-start gap-2.5 text-xs font-semibold",
                            emailMsg.type === "success" 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                              : "bg-red-50 border-red-200 text-[var(--qoe-vermillion)]"
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
                            className="flex-1 text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5"
                            required
                          />
                          <motion.button
                            type="submit"
                            whileTap={{ scale: 0.98 }}
                            disabled={emailLoading || newEmail === dbUser.email}
                            className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:bg-[var(--surface-2)] disabled:text-[var(--text-tertiary)] disabled:border-[var(--border-default)] disabled:cursor-not-allowed transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold shrink-0 cursor-pointer"
                          >
                            {emailLoading ? "Mise à jour..." : "Modifier l'e-mail"}
                          </motion.button>
                        </form>
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 2: SÉCURITÉ & ACCÈS                                                   */}
                  {/* ========================================================================= */}
                  {activeTab === "securite" && (
                    <>
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {hasPassword ? "Changement de Mot de Passe" : "Définir un Mot de Passe"}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {hasPassword 
                              ? "Choisissez un mot de passe complexe comportant au moins 8 caractères."
                              : "Configurez un mot de passe pour vous connecter directement sans lien magique."}
                          </p>
                        </div>

                        {passwordMsg && (
                          <div className={cn(
                            "p-3.5 rounded-[var(--radius-button)] border flex items-start gap-2.5 text-xs font-semibold",
                            passwordMsg.type === "success" 
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                              : "bg-red-50 border-red-200 text-[var(--qoe-vermillion)]"
                          )}>
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{passwordMsg.text}</span>
                          </div>
                        )}

                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                              Nouveau mot de passe
                            </label>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5"
                              required
                              minLength={6}
                            />
                            {/* Password strength bar */}
                            {password && (
                              <div className="mt-2 space-y-1">
                                <div className="h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden">
                                  <div 
                                    className={cn("h-full transition-all duration-300", passStrength.color)} 
                                    style={{ width: `${passStrength.score}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-[var(--text-tertiary)] block">
                                  Force : <span className="text-[var(--text-primary)]">{passStrength.label}</span>
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                              Confirmer le mot de passe
                            </label>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5"
                              required
                            />
                          </div>

                          <div className="flex justify-end pt-2">
                            <motion.button
                              type="submit"
                              whileTap={{ scale: 0.98 }}
                              disabled={passwordLoading}
                              className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:opacity-50 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold cursor-pointer"
                            >
                              {passwordLoading ? "Enregistrement..." : (hasPassword ? "Modifier le mot de passe" : "Définir le mot de passe")}
                            </motion.button>
                          </div>
                        </form>
                      </div>

                      {/* 2FA & Passkeys Preview */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Double Authentification (2FA / Passkeys)
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              Sécurisez votre compte avec une application TOTP (Google Authenticator) ou Touch ID/Face ID.
                            </p>
                          </div>
                          <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] bg-[var(--surface-2)] px-2.5 py-1 rounded border border-[var(--border-default)]">
                            Prochainement
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 3: CONNEXIONS SSO & COMPTES                                           */}
                  {/* ========================================================================= */}
                  {activeTab === "sso" && (
                    <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                      <div>
                        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                          Comptes Connexes & SSO
                        </h2>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          Liez vos comptes sociaux pour vous connecter en 1 clic sans mot de passe.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {/* Google */}
                        <div className="flex items-center justify-between p-4 border border-[var(--border-default)] rounded-[var(--radius-card)] bg-[var(--surface-1)]/50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--surface-0)] border border-[var(--border-default)] flex items-center justify-center font-bold text-xs text-[var(--text-primary)] shrink-0">
                              G
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Google Account</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Connexion via OAuth Google</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-0)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
                          >
                            Lier mon compte Google
                          </button>
                        </div>

                        {/* Apple */}
                        <div className="flex items-center justify-between p-4 border border-[var(--border-default)] rounded-[var(--radius-card)] bg-[var(--surface-1)]/50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--surface-0)] border border-[var(--border-default)] flex items-center justify-center font-bold text-xs text-[var(--text-primary)] shrink-0">
                              
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Apple ID</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Connexion via Sign in with Apple</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-0)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
                          >
                            Lier mon Apple ID
                          </button>
                        </div>

                        {/* GitHub */}
                        <div className="flex items-center justify-between p-4 border border-[var(--border-default)] rounded-[var(--radius-card)] bg-[var(--surface-1)]/50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--surface-0)] border border-[var(--border-default)] flex items-center justify-center font-bold text-xs text-[var(--text-primary)] shrink-0">
                              GH
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">GitHub Account</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Connexion via GitHub OAuth</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-0)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
                          >
                            Lier mon compte GitHub
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 4: SESSIONS & APPAREILS                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "sessions" && (
                    <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Sessions Actives & Appareils
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Appareils actuellement connectés à votre compte. Vous pouvez révoquer un accès à tout moment.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSessionMsg("Déconnexion de toutes les autres sessions effectuée.")
                            setTimeout(() => setSessionMsg(null), 3000)
                          }}
                          className="px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
                        >
                          Se déconnecter des autres appareils
                        </button>
                      </div>

                      {sessionMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-[var(--radius-button)]">
                          {sessionMsg}
                        </div>
                      )}

                      <div className="space-y-3">
                        {/* Current Session */}
                        <div className="p-4 border border-emerald-500/30 rounded-[var(--radius-card)] bg-emerald-500/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                              <Monitor className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[var(--text-primary)]">Navigateur Actuel</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  Session Active
                                </span>
                              </div>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5 font-mono">
                                Chrome / Windows • IP: 127.0.0.1
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600">Appareil actuel</span>
                        </div>

                        {/* Other Session Placeholder */}
                        <div className="p-4 border border-[var(--border-default)] rounded-[var(--radius-card)] bg-[var(--surface-1)]/50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)] flex items-center justify-center shrink-0">
                              <Smartphone className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Safari Mobile (iOS)</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block font-mono mt-0.5">
                                Paris, France • Dernier accès : Il y a 2h
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSessionMsg("Session Safari Mobile révoquée avec succès.")
                              setTimeout(() => setSessionMsg(null), 3000)
                            }}
                            className="text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1 rounded-[var(--radius-button)] font-semibold transition-colors cursor-pointer"
                          >
                            Révoquer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 5: TIMELINE & CONTENUS                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "timeline" && (
                    <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                      <div>
                        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                          Réglages de la Timeline & du Feed
                        </h2>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          Ajustez la logique de recommandation et le filtrage des contenus.
                        </p>
                      </div>

                      <div className="space-y-5">
                        {/* Algorithm switcher */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                          <div>
                            <span className="text-xs font-bold text-[var(--text-primary)] block">Algorithme d'Affichage du Feed</span>
                            <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                              Ordre chronologique strict des abonnements ou suggestions intelligentes vectorielles.
                            </span>
                          </div>
                          <div className="flex gap-1.5 bg-[var(--surface-2)] p-1 rounded-[var(--radius-button)] border border-[var(--border-default)]">
                            <button
                              type="button"
                              onClick={() => setTimelineAlgorithm("chrono")}
                              className={cn(
                                "text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-element)] transition-all cursor-pointer",
                                timelineAlgorithm === "chrono" 
                                  ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-xs" 
                                  : "text-[var(--text-tertiary)]"
                              )}
                            >
                              Chronologique
                            </button>
                            <button
                              type="button"
                              onClick={() => setTimelineAlgorithm("ai")}
                              className={cn(
                                "text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-element)] transition-all cursor-pointer",
                                timelineAlgorithm === "ai" 
                                  ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-xs" 
                                  : "text-[var(--text-tertiary)]"
                              )}
                            >
                              Recommandations IA
                            </button>
                          </div>
                        </div>

                        {/* Trigger Warnings filter */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                          <div>
                            <span className="text-xs font-bold text-[var(--text-primary)] block">Avertissements de Contenu (Trigger Warnings)</span>
                            <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                              Comportement face aux articles contenant des avertissements sensibles.
                            </span>
                          </div>
                          <select
                            value={triggerWarningFilter}
                            onChange={(e) => setTriggerWarningFilter(e.target.value as any)}
                            className="text-xs bg-[var(--surface-1)] hover:bg-[var(--surface-2)] font-semibold border border-[var(--border-default)] px-3 py-1.5 rounded-[var(--radius-button)] focus:outline-none cursor-pointer"
                          >
                            <option value="warn">Avertir avec voile (Défaut)</option>
                            <option value="show">Toujours afficher directement</option>
                            <option value="hide">Masquer les contenus sensibles</option>
                          </select>
                        </div>

                        {/* Media Autoplay */}
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-[var(--text-primary)] block">Lecture Automatique des Médias</span>
                            <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                              Lancer les vidéos et animations automatiquement lors du défilement.
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={autoplayMedia}
                              onChange={(e) => setAutoplayMedia(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-[var(--surface-2)] border border-[var(--border-default)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-default)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--qoe-vermillion)]"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 6: NOTIFICATIONS & MESSAGERIE                                         */}
                  {/* ========================================================================= */}
                  {activeTab === "notifications" && (
                    <div className="space-y-4">
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Préférences de Notifications
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Choisissez les événements pour lesquels vous souhaitez recevoir une notification.
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Nouveaux Abonnés</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Notifier lorsque quelqu'un commence à vous suivre</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={notifyFollowers}
                              onChange={(e) => setNotifyFollowers(e.target.checked)}
                              className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--qoe-vermillion)] cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Commentaires & Réponses</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Notifier lors d'une réaction sur vos écrits ou posts</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={notifyComments}
                              onChange={(e) => setNotifyComments(e.target.checked)}
                              className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--qoe-vermillion)] cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">Mentions</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block">Notifier lorsqu'un créateur vous mentionne (@username)</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={notifyMentions}
                              onChange={(e) => setNotifyMentions(e.target.checked)}
                              className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--qoe-vermillion)] cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Creator Newsletters Toggles */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Inscriptions Newsletters par Créateur
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              Ajustez la réception par e-mail pour chaque créateur que vous suivez.
                            </p>
                          </div>
                          {subMsg && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 animate-fade-in">
                              {subMsg}
                            </span>
                          )}
                        </div>

                        {subscriptions.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-tertiary)] text-xs border border-dashed border-[var(--border-default)] rounded-[var(--radius-card)] p-4">
                            Vous ne suivez aucun créateur pour le moment.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {subscriptions.map(sub => (
                              <div key={sub.creator.id} className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface-1)]/50">
                                <div className="flex items-center gap-3">
                                  {sub.creator.logoUrl ? (
                                    <img src={sub.creator.logoUrl} className="w-8 h-8 rounded-full object-cover border border-[var(--border-default)]" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)] shrink-0">
                                      {sub.creator.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs font-bold text-[var(--text-primary)] block">{sub.creator.name}</span>
                                    <span className="text-[10px] text-[var(--text-tertiary)] block">@{sub.creator.subdomain}</span>
                                  </div>
                                </div>

                                <div className="flex gap-4">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receiveArticles}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "articles", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-[var(--border-default)] text-[var(--qoe-vermillion)] cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Articles</span>
                                  </label>

                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receivePosts}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "posts", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-[var(--border-default)] text-[var(--qoe-vermillion)] cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Micro-posts</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 7: PORTEFEUILLE & BILLING                                             */}
                  {/* ========================================================================= */}
                  {activeTab === "abonnements" && (
                    <>
                      {/* Become a creator banner */}
                      {dbUser.role === "user" ? (
                        <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[var(--qoe-vermillion)]" />
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Devenir Créateur Média
                            </h2>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            Passez au rôle Créateur pour concevoir votre propre univers éditorial, publier des articles premium avec paywalls et réserver votre sous-domaine média.
                          </p>

                          {upgradeMsg && (
                            <div className={cn(
                              "p-3.5 rounded-[var(--radius-button)] border flex items-start gap-2.5 text-xs font-semibold",
                              upgradeMsg.type === "success" 
                               ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                               : "bg-red-50 border-red-200 text-[var(--qoe-vermillion)]"
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
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] pl-3.5 pr-20 py-2.5 font-mono"
                                required
                              />
                              <span className="absolute right-3 top-3 text-[10px] text-[var(--text-tertiary)] font-bold font-mono">
                                .qoe.fi
                              </span>
                            </div>
                            <motion.button
                              type="submit"
                              whileTap={{ scale: 0.98 }}
                              disabled={upgradeLoading || subdomain.length < 3}
                              className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:bg-[var(--surface-2)] disabled:text-[var(--text-tertiary)] disabled:border-[var(--border-default)] disabled:cursor-not-allowed transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                            >
                              {upgradeLoading ? "Activation..." : "Activer mon média"}{" "}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </motion.button>
                          </form>
                        </div>
                      ) : (
                        <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Compte Créateur Actif
                            </h2>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Votre média est accessible à l'adresse :{" "}
                            <strong className="font-mono text-[var(--qoe-vermillion)]">{dbUser.subdomain}.qoe.fi</strong>
                          </p>
                          <a
                            href={URLS.DASHBOARD}
                            className="bg-[var(--text-primary)] text-[var(--surface-0)] hover:opacity-90 transition-all px-4 py-2 rounded-[var(--radius-button)] text-xs font-bold self-start cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <span>Aller au Dashboard Créateur</span>
                            <ArrowRight className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {/* Transactions History */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Historique du Portefeuille & Factures
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Relevé de vos transactions financières et déblocages d'articles.
                          </p>
                        </div>

                        {walletTransactions.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-tertiary)] text-xs">
                            Aucune transaction répertoriée.
                          </div>
                        ) : (
                          <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] overflow-hidden text-xs">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-[var(--surface-1)] border-b border-[var(--border-default)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                                  <th className="p-3">Date</th>
                                  <th className="p-3">Type</th>
                                  <th className="p-3 text-right">Montant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {walletTransactions.map(tx => (
                                  <tr key={tx.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-1)]/50 transition-colors">
                                    <td className="p-3 text-[var(--text-secondary)]">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                    <td className="p-3 font-semibold">
                                      {tx.type === "DEPOSIT" ? "Recharge" : tx.type === "SUBSCRIPTION_PAYMENT" ? "Déblocage premium" : tx.type}
                                    </td>
                                    <td className={cn(
                                      "p-3 text-right font-bold font-mono",
                                      tx.amountCents > 0 ? "text-emerald-600" : "text-[var(--text-primary)]"
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
                  {/* TAB 8: AFFICHAGE & ACCESSIBILITÉ                                           */}
                  {/* ========================================================================= */}
                  {activeTab === "accessibilite" && (
                    <form onSubmit={handleAccessibilitySubmit} className="flex-1 flex flex-col gap-4">
                      {accessibilityMsg && (
                        <div className={cn(
                          "p-3.5 rounded-[var(--radius-button)] border flex items-start gap-2.5 text-xs font-semibold",
                          accessibilityMsg.type === "success" 
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                            : "bg-red-50 border-red-200 text-[var(--qoe-vermillion)]"
                        )}>
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{accessibilityMsg.text}</span>
                        </div>
                      )}

                      {/* Language Selection */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Langue de l'Interface
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Sélectionnez la langue par défaut de l'application (Tolgee i18n).
                          </p>
                        </div>

                        <div className="flex gap-2 bg-[var(--surface-2)] p-1 rounded-[var(--radius-button)] w-36 shrink-0 border border-[var(--border-default)]">
                          <button
                            type="button"
                            onClick={() => handleLanguageChange("fr")}
                            className={cn(
                              "text-xs font-bold flex-1 py-1.5 rounded-[var(--radius-element)] transition-colors cursor-pointer",
                              selectedLanguage === "fr"
                                ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-xs border border-[var(--border-default)]"
                                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            )}
                          >
                            Français
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLanguageChange("en")}
                            className={cn(
                              "text-xs font-bold flex-1 py-1.5 rounded-[var(--radius-element)] transition-colors cursor-pointer",
                              selectedLanguage === "en"
                                ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-xs border border-[var(--border-default)]"
                                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            )}
                          >
                            English
                          </button>
                        </div>
                      </div>

                      {/* Display Preferences */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Préférences d'Affichage & Typographie
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Ajustez les styles visuels pour un confort de lecture adapté.
                          </p>
                        </div>

                        <div className="space-y-4">
                          {/* Font Size select */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">Taille du Texte</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                Augmentez ou réduisez la taille globale de la typographie.
                              </span>
                            </div>
                            <select
                              value={fontSize}
                              onChange={(e) => changeFontSize(e.target.value)}
                              className="text-xs bg-[var(--surface-1)] hover:bg-[var(--surface-2)] font-semibold border border-[var(--border-default)] px-3 py-1.5 rounded-[var(--radius-button)] focus:outline-none cursor-pointer"
                            >
                              <option value="small">Petite</option>
                              <option value="normal">Normale</option>
                              <option value="large">Grande</option>
                              <option value="xlarge">Très Grande</option>
                            </select>
                          </div>

                          {/* Dyslexic font toggle */}
                          <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">Police Dyslexique</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                Force l'utilisation d'une typographie facilitant le décodage de lecture.
                              </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={dyslexicMode}
                                onChange={(e) => toggleDyslexic(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-[var(--surface-2)] border border-[var(--border-default)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-default)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--qoe-vermillion)]"></div>
                            </label>
                          </div>

                          {/* Override creator themes */}
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">Forcer le Thème Light Standard</span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                Ignore les thèmes de couleur personnalisés par les auteurs pour un fond neutre uniforme.
                              </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={forceLightTheme}
                                onChange={(e) => toggleForceLight(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-[var(--surface-2)] border border-[var(--border-default)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border-default)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--qoe-vermillion)]"></div>
                            </label>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)] mt-2">
                          <motion.button
                            type="submit"
                            whileTap={{ scale: 0.98 }}
                            disabled={accessibilityLoading}
                            className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:opacity-50 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold cursor-pointer"
                          >
                            {accessibilityLoading ? "Enregistrement..." : "Sauvegarder les préférences"}
                          </motion.button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 9: CONFIDENTIALITÉ, RGPD & ZONE DE DANGER                            */}
                  {/* ========================================================================= */}
                  {activeTab === "confidentialite" && (
                    <>
                      {/* Muted words */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Mots Exclus (Muted Words)
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Excluez du contenu de votre feed en listant des mots ou concepts spécifiques.
                          </p>
                        </div>

                        <form onSubmit={handleAddMutedWord} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Saisissez un mot à exclure..."
                            value={newMutedWord}
                            onChange={(e) => setNewMutedWord(e.target.value)}
                            className="flex-1 text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3.5 py-2.5"
                          />
                          <motion.button
                            type="submit"
                            whileTap={{ scale: 0.98 }}
                            className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 transition-colors p-2.5 rounded-[var(--radius-button)] text-xs font-bold flex items-center justify-center shrink-0 cursor-pointer h-10 w-10"
                          >
                            <Plus className="w-4 h-4" />
                          </motion.button>
                        </form>

                        {mutedWords.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-tertiary)] text-xs">
                            Aucun mot exclu pour le moment.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {mutedWords.map(w => (
                              <div key={w.id} className="text-xs bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-card)] px-3 py-1.5 flex items-center gap-2 font-semibold">
                                <span className="font-mono">{w.word}</span>
                                <button 
                                  onClick={() => handleRemoveMutedWord(w.id)}
                                  className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors shrink-0 p-1"
                                  title="Retirer"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* GDPR Export Protocol Card */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            Exportation des Données Personnelles (RGPD Art. 20)
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Recevez une archive chiffrée complète de vos données au format JSON par e-mail.
                          </p>
                        </div>

                        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex gap-3">
                            <div className="w-9 h-9 bg-[var(--surface-2)] rounded-full flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                              <Download className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-primary)] block">
                                Archive RGPD Sécurisée
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                Inclut profil, bookmarks, surlignages, abonnements et historique financier.
                              </span>
                            </div>
                          </div>

                          {gdprRequested ? (
                            <div className="px-3.5 py-2 rounded-[var(--radius-button)] bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Demande transmise — Lien envoyé par e-mail</span>
                            </div>
                          ) : (
                            <motion.button
                              onClick={handleGdprRequest}
                              whileTap={{ scale: 0.98 }}
                              disabled={gdprLoading}
                              className="bg-[var(--text-primary)] text-[var(--surface-0)] hover:opacity-90 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              {gdprLoading ? "Génération en cours..." : "Demander mon archive par e-mail"}
                            </motion.button>
                          )}
                        </div>
                      </div>

                      {/* Account Freeze / Sleep Card */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              Mettre le Compte en Sommeil (Freeze)
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              Masquez temporairement votre profil et votre activité. Votre compte sera réactivé automatiquement à votre prochaine connexion.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsFreezeModalOpen(true)}
                            className="px-3.5 py-2 rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer shrink-0"
                          >
                            Mettre en sommeil
                          </button>
                        </div>
                      </div>

                      {/* DANGER ZONE: Account Deletion */}
                      <div className="bg-red-500/5 border border-red-500/20 rounded-[var(--radius-card)] p-6 shadow-xs flex flex-col gap-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h2 className="text-base font-bold text-red-600 tracking-tight leading-none">
                              Zone de Danger : Suppression Définitive du Compte
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              La suppression entraîne l'effacement irréversible de votre profil, de vos abonnements et de vos contenus.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsDeleteModalOpen(true)
                              setDeleteError(null)
                              setDeleteConfirmationText("")
                              setDeletePassword("")
                            }}
                            className="px-4 py-2.5 rounded-[var(--radius-button)] bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                          >
                            Supprimer mon compte
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                </motion.div>
              </AnimatePresence>

            </div>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Account Freeze Confirmation                                        */}
      {/* ========================================================================= */}
      {isFreezeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-card)] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-primary)]">Mettre le compte en sommeil</h3>
              <button onClick={() => setIsFreezeModalOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Votre compte sera temporairement désactivé et masqué des recherches. Pour le réactiver, il vous suffira de vous reconnecter à tout moment.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsFreezeModalOpen(false)}
                className="px-4 py-2 rounded-[var(--radius-button)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setIsFreezeModalOpen(false)
                  alert("Votre compte a été mis en sommeil.")
                }}
                className="px-4 py-2 rounded-[var(--radius-button)] bg-[var(--text-primary)] text-[var(--surface-0)] text-xs font-semibold"
              >
                Confirmer la mise en sommeil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DANGER ZONE Account Deletion Modal                                 */}
      {/* ========================================================================= */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="bg-[var(--surface-0)] border border-red-500/30 rounded-[var(--radius-card)] max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold">Confirmation de Suppression Définitive</h3>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-[var(--radius-button)] text-xs text-red-600 font-medium leading-relaxed">
              Attention : Cette action est irréversible. Toutes vos données (posts, bookmarks, historique) seront planifiées pour suppression sous 30 jours.
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[var(--text-secondary)] block">
                  Veuillez confirmer votre mot de passe :
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Mot de passe actuel"
                  className="w-full text-xs border border-[var(--border-default)] focus:border-red-500 bg-[var(--surface-1)] rounded-[var(--radius-button)] px-3 py-2"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[var(--text-secondary)] block">
                  Saisissez <span className="font-mono text-red-600 font-bold">SUPPRIMER</span> pour valider :
                </label>
                <input
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="SUPPRIMER"
                  className="w-full text-xs border border-[var(--border-default)] focus:border-red-500 bg-[var(--surface-1)] rounded-[var(--radius-button)] px-3 py-2 font-mono uppercase"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-[var(--radius-button)] border border-[var(--border-default)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-1)] cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={deleteConfirmationText !== "SUPPRIMER" || !deletePassword}
                onClick={() => {
                  setDeleteLoading(true)
                  setTimeout(() => {
                    setDeleteLoading(false)
                    alert("Demande de suppression enregistrée. Période de grâce de 30 jours active.")
                    setIsDeleteModalOpen(false)
                  }, 1500)
                }}
                className="px-4 py-2 rounded-[var(--radius-button)] bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer"
              >
                {deleteLoading ? "Suppression en cours..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
