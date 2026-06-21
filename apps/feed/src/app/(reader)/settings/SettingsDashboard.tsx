"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  User, Lock, ShieldAlert, Globe, HelpCircle, 
  CreditCard, Download, Plus, Trash, Check, AlertCircle, ArrowRight, Sparkles, Sliders, Camera, Loader2
} from "lucide-react"
import { 
  updateProfile, upgradeToCreator, updateNewsletterPreferences, 
  updateSecurityEmail, updateSecurityPassword, exportUserData,
  addMutedWord, removeMutedWord
} from "./actions"

import { useTranslate, useTolgee } from "@tolgee/react"
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
  subscriptions: initialSubscriptions,
  walletTransactions,
  mutedWords: initialMutedWords,
  blockedUsers
}: SettingsDashboardProps) {
  const router = useRouter()
  const { t } = useTranslate()
  const tolgee = useTolgee()

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
    { id: "compte", label: t("settings_reader.tab_account", "Votre Compte"), icon: User },
    { id: "securite", label: t("settings_reader.tab_security", "Sécurité & Accès"), icon: Lock },
    { id: "abonnements", label: t("settings_reader.tab_billing", "Portefeuille & Abonnements"), icon: CreditCard },
    { id: "confidentialite", label: t("settings_reader.tab_privacy", "Confidentialité & Blocages"), icon: ShieldAlert },
    { id: "accessibilite", label: t("settings_reader.tab_accessibility", "Affichage & Langues"), icon: Sliders },
    { id: "aide", label: t("settings_reader.tab_help", "Aide & Ressources"), icon: HelpCircle }
  ]

  // Handlers
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    const res = await updateProfile({ name, username, avatarUrl, bio })
    setProfileLoading(false)
    if (res.success) {
      setProfileMsg({ type: "success", text: t("settings_reader.msg_profile_success", "Profil mis à jour avec succès !") })
      trackServerEvent("profile_updated")
      router.refresh()
    } else {
      setProfileMsg({ 
        type: "error", 
        text: res.error === "USERNAME_TAKEN" 
          ? t("settings_reader.msg_username_taken", "Ce nom d'utilisateur est déjà pris.") 
          : t("settings_reader.msg_error_general", "Une erreur est survenue lors de l'enregistrement.") 
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
      setEmailMsg({ type: "success", text: t("settings_reader.msg_email_success", "Un e-mail de confirmation a été envoyé à la nouvelle adresse.") })
      trackServerEvent("security_email_updated")
    } else {
      setEmailMsg({ type: "error", text: res.error || t("settings_reader.msg_error_general", "Une erreur est survenue lors de l'enregistrement.") })
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setPasswordMsg({ type: "error", text: t("settings_reader.msg_password_mismatch", "Les mots de passe ne correspondent pas.") })
      return
    }
    setPasswordLoading(true)
    setPasswordMsg(null)
    const res = await updateSecurityPassword(password)
    setPasswordLoading(false)
    if (res.success) {
      setPasswordMsg({ type: "success", text: t("settings_reader.msg_password_success", "Mot de passe modifié avec succès !") })
      trackServerEvent("security_password_updated")
      setPassword("")
      setConfirmPassword("")
    } else {
      setPasswordMsg({ type: "error", text: res.error || t("settings_reader.msg_error_general", "Une erreur est survenue lors de l'enregistrement.") })
    }
  }

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpgradeLoading(true)
    setUpgradeMsg(null)
    const res = await upgradeToCreator(subdomain)
    setUpgradeLoading(false)
    if (res.success) {
      setUpgradeMsg({ type: "success", text: t("settings_reader.msg_creator_success", "Compte créateur activé ! Redirection vers votre nouvel espace...") })
      trackServerEvent("upgrade_creator_clicked", { subdomain })
      setTimeout(() => {
        window.location.href = URLS.DASHBOARD
      }, 1500)
    } else {
      setUpgradeMsg({ 
        type: "error", 
        text: res.error === "SUBDOMAIN_TAKEN" 
          ? t("settings_reader.msg_subdomain_taken", "Ce sous-domaine est déjà réservé.") 
          : t("settings_reader.msg_subdomain_invalid", "Format de sous-domaine invalide (3 caractères min, sans caractères spéciaux).") 
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
      setSubMsg(t("settings_reader.msg_newsletter_success", "Préférences de messagerie enregistrées."))
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

  const handleLanguageChange = async (lang: string) => {
    // TODO i18n: brancher sur @qoe/i18n/setLanguage quand implémenté
    // await setLanguage(lang)
    void lang
    trackServerEvent("language_changed", { lang })
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
      trackServerEvent("gdpr_export_requested")
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
    trackServerEvent("dyslexic_mode_toggled", { enabled: val })
  }

  const toggleForceLight = (val: boolean) => {
    setForceLightTheme(val)
    localStorage.setItem("force-light-theme", String(val))
    trackServerEvent("force_light_theme_toggled", { enabled: val })
  }

  const changeFontSize = (val: string) => {
    setFontSize(val)
    localStorage.setItem("font-size-preference", val)
    document.documentElement.setAttribute("data-font-size", val)
    trackServerEvent("font_size_changed", { size: val })
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-300 font-sans pb-16 selection:bg-[var(--qoe-vermillion-10)] selection:text-[var(--qoe-vermillion)]">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Settings Tabs Sidebar                                        */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-[var(--surface-0)] border border-[var(--border-default)] rounded-[var(--radius-plateau)] p-5 space-y-6 shadow-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block px-3 mb-3">
                  {t("settings_reader.general_settings_header", "Réglages Généraux")}
                </span>
                <div className="space-y-1 relative">
                  {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                      <motion.button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        whileTap={{ scale: 0.98 }}
                        className="relative z-10 w-full text-left px-3.5 py-3 rounded-[var(--radius-button)] text-xs font-semibold transition-colors duration-200 flex items-center gap-2.5 group cursor-pointer"
                      >
                        {activeTab === tab.id && (
                          <motion.div
                            layoutId="settingsTabHighlight"
                            transition={springs.indicator}
                            className="absolute inset-0 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-[var(--radius-button)] -z-10"
                          />
                        )}
                        <Icon className={cn(
                          "w-4 h-4 transition-colors",
                          activeTab === tab.id ? "text-[var(--qoe-vermillion)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"
                        )} />
                        <span className={cn(
                          "transition-colors", 
                          activeTab === tab.id ? "text-[var(--qoe-vermillion)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                        )}>
                          {tab.label}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-tertiary)] px-3">
                <p>qoe.fi v0.2 • {t("hero.plateau_label", "qoe.fi — Plateau")}</p>
                <p className="mt-1">{t("settings_reader.gdpr_subtitle", "Conformément au RGPD européen, téléchargez une copie complète de vos données au format portable JSON.")}</p>
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={springs.tab}
                  className="flex-1 flex flex-col gap-4"
                >
                  
                  {/* ========================================================================= */}
                  {/* TAB 1: VOTRE COMPTE                                                       */}
                  {/* ========================================================================= */}
                  {activeTab === "compte" && (
                    <>
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.title", "Votre Profil Lecteur")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.subtitle", "Personnalisez votre identité et vos thèmes sur la plateforme.")}
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
                                {t("settings_reader.display_name", "Nom d'affichage")}
                              </label>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                                {t("settings_reader.username", "Nom d'utilisateur")}
                              </label>
                              <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                              {t("settings_reader.profile_picture", "Photo de profil")}
                            </label>
                            <div className="flex items-center gap-4">
                              <div className="relative w-16 h-16 border border-[var(--border-default)] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-1)] group shrink-0 shadow-xs flex items-center justify-center">
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-lg text-[var(--text-tertiary)] bg-[var(--surface-2)]">
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
                                          alert(uploadData.error || t("settings_reader.msg_error_general", "Une erreur est survenue lors de l'enregistrement."))
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
                                  placeholder={t("settings_reader.profile_picture_placeholder", "URL de l'image ou téléversez-en une...")}
                                  onChange={(e) => setAvatarUrl(e.target.value)}
                                  className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
                                />
                                <span className="text-[9px] text-[var(--text-tertiary)] block px-1">
                                  {t("settings_reader.profile_picture_help", "Survolez le carré à gauche pour importer directement un fichier.")}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                              {t("settings_reader.bio_label", "ADN Lecteur (Biographie)")}
                            </label>
                            <textarea
                              value={bio}
                              rows={4}
                              placeholder={t("settings_reader.bio_placeholder", "Décrivez vos lectures idéales pour calibrer le matching vectoriel pgvector.")}
                              onChange={(e) => setBio(e.target.value)}
                              className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-card)] p-3 resize-none"
                            />
                          </div>

                          <div className="flex justify-end pt-2">
                            <motion.button
                              type="submit"
                              whileTap={{ scale: 0.98 }}
                              disabled={profileLoading}
                              className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:opacity-50 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold cursor-pointer"
                            >
                              {profileLoading ? t("settings_reader.saving", "Enregistrement...") : t("settings_reader.save_changes", "Sauvegarder les modifications")}
                            </motion.button>
                          </div>
                        </form>
                      </div>

                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.email_title", "Adresse de Messagerie")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.email_subtitle", "Modifiez l'adresse e-mail de connexion à votre compte.")}
                          </p>
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
                            className="flex-1 text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
                            required
                          />
                          <motion.button
                            type="submit"
                            whileTap={{ scale: 0.98 }}
                            disabled={emailLoading || newEmail === dbUser.email}
                            className="bg-[var(--qoe-vermillion)] text-white hover:opacity-90 disabled:bg-[var(--surface-2)] disabled:text-[var(--text-tertiary)] disabled:border-[var(--border-default)] disabled:cursor-not-allowed transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold shrink-0 cursor-pointer"
                          >
                            {emailLoading ? t("settings_reader.email_updating", "Mise à jour...") : t("settings_reader.email_btn", "Modifier l'email")}
                          </motion.button>
                        </form>
                      </div>

                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.gdpr_title", "Données Personnelles (RGPD)")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.gdpr_subtitle", "Conformément au RGPD européen, téléchargez une copie complète de vos données au format portable JSON.")}
                          </p>
                        </div>

                        <div className="bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex gap-3">
                            <div className="w-9 h-9 bg-[var(--surface-2)] rounded-[var(--radius-icon)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                              <Download className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">
                                {t("settings_reader.gdpr_file_label", "Fichier qoe-user-data.json")}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                {t("settings_reader.gdpr_file_desc", "Inclut profil, bookmarks, highlights, abonnements et transactions.")}
                              </span>
                            </div>
                          </div>
                          <motion.button
                            onClick={handleGdprExport}
                            whileTap={{ scale: 0.98 }}
                            disabled={gdprLoading}
                            className="bg-[var(--text-primary)] text-[var(--surface-0)] hover:opacity-90 transition-all px-4 py-2.5 rounded-[var(--radius-button)] text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {gdprLoading ? t("settings_reader.gdpr_preparing", "Préparation...") : t("settings_reader.gdpr_btn", "Exporter mes données")}
                          </motion.button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 2: SECURITE                                                           */}
                  {/* ========================================================================= */}
                  {activeTab === "securite" && (
                    <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                          {t("settings_reader.password_title", "Changement de Mot de Passe")}
                        </h2>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {t("settings_reader.password_subtitle", "Configurez un nouveau mot de passe fort pour sécuriser votre compte.")}
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
                            {t("settings_reader.new_password", "Nouveau mot de passe")}
                          </label>
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
                            required
                            minLength={6}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] block px-1">
                            {t("settings_reader.confirm_password", "Confirmer le mot de passe")}
                          </label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
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
                            {passwordLoading ? t("settings_reader.saving", "Enregistrement...") : t("settings_reader.password_btn", "Modifier le mot de passe")}
                          </motion.button>
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
                        <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#F97316]" />
                            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              {t("settings_reader.creator_banner_title", "Devenir Créateur Média")}
                            </h2>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {t("settings_reader.creator_banner_desc", "Passez au rôle Créateur pour concevoir votre propre univers éditorial. Publiez des articles premium avec paywalls, des micro-posts, gérez une liste de diffusion de newsletters et définissez votre design system exclusif.")}
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
                                placeholder={t("settings_reader.creator_subdomain_placeholder", "votre-media")}
                                value={subdomain}
                                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                className="w-full text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] pl-3 pr-24 py-2.5"
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
                              {upgradeLoading ? t("settings_reader.creator_btn_loading", "Activation...") : t("settings_reader.creator_btn", "Activer mon média")}{" "}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </motion.button>
                          </form>
                        </div>
                      ) : (
                        <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              {t("settings_reader.creator_active_title", "Compte Créateur Actif")}
                            </h2>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {t("settings_reader.creator_active_desc", "Votre média est accessible à l'adresse :")}{" "}
                            <strong className="font-mono text-[var(--qoe-vermillion)]">{dbUser.subdomain}.qoe.fi</strong>
                          </p>
                          <motion.button
                            onClick={() => window.location.href = URLS.DASHBOARD}
                            whileTap={{ scale: 0.98 }}
                            className="bg-[var(--text-primary)] text-[var(--surface-0)] hover:opacity-90 transition-all px-4 py-2 rounded-[var(--radius-button)] text-xs font-bold self-start cursor-pointer"
                          >
                            {t("settings_reader.creator_go_dashboard", "Aller au Dashboard Créateur")}
                          </motion.button>
                        </div>
                      )}

                      {/* Newsletter Toggles */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                              {t("settings_reader.newsletter_pref_title", "Préférences de Messagerie")}
                            </h2>
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              {t("settings_reader.newsletter_pref_subtitle", "Sélectionnez les contenus que vous souhaitez recevoir par e-mail par créateur.")}
                            </p>
                          </div>
                          {subMsg && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-[var(--radius-chip)] border border-emerald-200 animate-fade-in">
                              {subMsg}
                            </span>
                          )}
                        </div>

                        {subscriptions.length === 0 ? (
                          <div className="text-center py-8 text-[var(--text-tertiary)] text-xs border border-dashed border-[var(--border-default)] rounded-[var(--radius-card)] p-4">
                            {t("settings_reader.no_creator_followed", "Vous ne suivez aucun créateur pour le moment.")}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {subscriptions.map(sub => (
                              <div key={sub.creator.id} className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface-1)]/50">
                                <div className="flex items-center gap-3">
                                  {sub.creator.logoUrl ? (
                                    <img src={sub.creator.logoUrl} className="w-8 h-8 rounded-[var(--radius-icon)] object-cover border border-[var(--border-default)]" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-[var(--radius-icon)] bg-[var(--qoe-vermillion-08)] flex items-center justify-center font-bold text-xs text-[var(--qoe-vermillion)]">
                                      {sub.creator.name?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs font-bold text-[var(--text-primary)] block">{sub.creator.name}</span>
                                    <span className="text-[10px] text-[var(--text-tertiary)] block">@{sub.creator.subdomain}</span>
                                  </div>
                                </div>

                                <div className="flex gap-4">
                                  {/* Toggle Articles */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receiveArticles}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "articles", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded-[var(--radius-element)] border-[var(--border-default)] text-[var(--qoe-vermillion)] focus:ring-[var(--qoe-vermillion)]/30 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Articles</span>
                                  </label>

                                  {/* Toggle Posts */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sub.receivePosts}
                                      onChange={(e) => handleNewsletterToggle(sub.creator.id, "posts", e.target.checked)}
                                      className="w-3.5 h-3.5 rounded-[var(--radius-element)] border-[var(--border-default)] text-[var(--qoe-vermillion)] focus:ring-[var(--qoe-vermillion)]/30 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Tweets / Posts</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Transactions History */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.wallet_history_title", "Historique du Portefeuille")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.wallet_history_subtitle", "Relevé de vos transactions financières et déblocages d'articles.")}
                          </p>
                        </div>

                        {walletTransactions.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-tertiary)] text-xs">
                            {t("settings_reader.no_transactions", "Aucune transaction répertoriée.")}
                          </div>
                        ) : (
                          <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] overflow-hidden text-xs">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-[var(--surface-1)] border-b border-[var(--border-default)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                                    <th className="p-3">{t("settings_reader.th_date", "Date")}</th>
                                    <th className="p-3">{t("settings_reader.th_type", "Type")}</th>
                                    <th className="p-3 text-right">{t("settings_reader.th_amount", "Montant")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {walletTransactions.map(tx => (
                                    <tr key={tx.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-1)]/50 transition-colors">
                                      <td className="p-3 text-[var(--text-secondary)]">{new Date(tx.createdAt).toLocaleDateString()}</td>
                                      <td className="p-3 font-semibold">
                                        {tx.type === "DEPOSIT" ? t("settings_reader.tx_deposit", "Recharge") : tx.type === "SUBSCRIPTION_PAYMENT" ? t("settings_reader.tx_unlock", "Déblocage premium") : tx.type}
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
                  {/* TAB 4: PRIVACY & BLOCKAGES                                                */}
                  {/* ========================================================================= */}
                  {activeTab === "confidentialite" && (
                    <>
                      {/* Muted words */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-5">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.muted_words_title", "Mots exclus (Muted Words)")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.muted_words_subtitle", "Excluez du contenu de votre feed en listant des mots ou concepts spécifiques (protection de l'attention).")}
                          </p>
                        </div>

                        <form onSubmit={handleAddMutedWord} className="flex gap-2">
                          <input
                            type="text"
                            placeholder={t("settings_reader.muted_words_placeholder", "Saisissez un mot (ex: politique, football...)")}
                            value={newMutedWord}
                            onChange={(e) => setNewMutedWord(e.target.value)}
                            className="flex-1 text-xs border border-[var(--border-default)] focus:border-[var(--text-tertiary)] focus:outline-none bg-[var(--surface-1)] focus:bg-[var(--surface-0)] rounded-[var(--radius-button)] px-3 py-2.5"
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
                            {t("settings_reader.no_muted_words", "Aucun mot exclu pour le moment.")}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {mutedWords.map(w => (
                              <div key={w.id} className="text-xs bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-card)] px-3 py-1.5 flex items-center gap-2 font-semibold">
                                <span className="font-mono">{w.word}</span>
                                <button 
                                  onClick={() => handleRemoveMutedWord(w.id)}
                                  className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors shrink-0 p-2 -m-2"
                                  title="Retirer"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Blocked accounts list */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.blocked_title", "Comptes Bloqués")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.blocked_subtitle", "Utilisateurs bloqués que vous ne souhaitez plus voir interagir sur vos espaces.")}
                          </p>
                        </div>

                        {blockedUsers.length === 0 ? (
                          <div className="text-center py-6 text-[var(--text-tertiary)] text-xs">
                            {t("settings_reader.no_blocked", "Aucun utilisateur bloqué.")}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {blockedUsers.map(b => (
                              <div key={b.id} className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-3 flex items-center justify-between text-xs bg-[var(--surface-1)]/50">
                                <div>
                                  <span className="font-bold text-[var(--text-secondary)] block">{b.user.name}</span>
                                  <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">@{b.user.username || b.user.email.split("@")[0]}</span>
                                </div>
                                <span className="text-[9px] text-[var(--text-tertiary)] font-semibold font-mono">
                                  {t("settings_reader.blocked_on", "Bloqué le")} {new Date(b.createdAt).toLocaleDateString()}
                                </span>
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
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-4">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.interface_lang_title", "Langue de l'Interface")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.interface_lang_subtitle", "Sélectionnez la langue par défaut de l'application.")}
                          </p>
                        </div>

                        <div className="flex gap-2 bg-[var(--surface-2)] p-1 rounded-[var(--radius-button)] w-32 shrink-0 border border-[var(--border-default)]">
                          <motion.button
                            onClick={() => handleLanguageChange("fr")}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "text-xs font-bold flex-1 py-2 rounded-[var(--radius-element)] transition-colors cursor-pointer",
                              tolgee.getLanguage() === "fr"
                                ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-sm border border-[var(--border-default)]"
                                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            )}
                          >
                            Français
                          </motion.button>
                          <motion.button
                            onClick={() => handleLanguageChange("en")}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "text-xs font-bold flex-1 py-2 rounded-[var(--radius-element)] transition-colors cursor-pointer",
                              tolgee.getLanguage() === "en"
                                ? "bg-[var(--surface-0)] text-[var(--text-primary)] shadow-sm border border-[var(--border-default)]"
                                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            )}
                          >
                            English
                          </motion.button>
                        </div>
                      </div>

                      {/* Display Preferences */}
                      <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                        <div>
                          <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                            {t("settings_reader.display_pref_title", "Préférences d'Affichage")}
                          </h2>
                          <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            {t("settings_reader.display_pref_subtitle", "Ajustez les styles visuels pour un confort de lecture adapté.")}
                          </p>
                        </div>

                        <div className="space-y-4">
                          {/* Font Size select */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">
                                {t("settings_reader.font_size_label", "Taille du Texte")}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                {t("settings_reader.font_size_desc", "Augmentez ou réduisez la taille globale de la typographie.")}
                              </span>
                            </div>
                            <select
                              value={fontSize}
                              onChange={(e) => changeFontSize(e.target.value)}
                              className="text-xs bg-[var(--surface-1)] hover:bg-[var(--surface-2)] font-semibold border border-[var(--border-default)] px-3 py-1.5 rounded-[var(--radius-button)] focus:outline-none cursor-pointer"
                            >
                              <option value="small">{t("settings_reader.font_size_small", "Petite")}</option>
                              <option value="normal">{t("settings_reader.font_size_normal", "Normale")}</option>
                              <option value="large">{t("settings_reader.font_size_large", "Grande")}</option>
                              <option value="xlarge">{t("settings_reader.font_size_xlarge", "Très Grande")}</option>
                            </select>
                          </div>

                          {/* Dyslexic font toggle */}
                          <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">
                                {t("settings_reader.dyslexic_label", "Police Dyslexique")}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                {t("settings_reader.dyslexic_desc", "Force l'utilisation d'une typographie simplifiée facilitant le décodage de lecture.")}
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
                              <span className="text-xs font-bold text-[var(--text-secondary)] block">
                                {t("settings_reader.force_light_label", "Forcer le Thème Light Standard")}
                              </span>
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5">
                                {t("settings_reader.force_light_desc", "Ignore les styles de couleur et polices personnalisés par les auteurs pour un fond blanc neuve uniforme.")}
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
                      </div>
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* TAB 6: AIDE & ACCUEIL                                                     */}
                  {/* ========================================================================= */}
                  {activeTab === "aide" && (
                    <div className="bg-[var(--surface-0)] rounded-[var(--radius-card)] p-6 shadow-xs border border-[var(--border-default)] flex flex-col gap-6">
                      <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight leading-none">
                          {t("settings_reader.help_title", "Centre d'Aide & Ressources")}
                        </h2>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {t("settings_reader.help_subtitle", "Informations légales et accompagnement utilisateur.")}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex flex-col gap-1.5 hover:bg-[var(--surface-1)] transition-colors">
                          <span className="font-bold text-[var(--text-secondary)]">
                            {t("settings_reader.support_title", "Support Technique")}
                          </span>
                          <span className="text-[var(--text-secondary)] leading-normal">
                            {t("settings_reader.support_desc", "Une question sur vos abonnements ou votre solde ? Envoyez un message à notre équipe de support technique.")}
                          </span>
                          <a href="mailto:support@qoe.fi" className="text-[var(--qoe-vermillion)] hover:underline font-semibold block mt-2">support@qoe.fi</a>
                        </div>

                        <div className="border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 flex flex-col gap-1.5 hover:bg-[var(--surface-1)] transition-colors">
                          <span className="font-bold text-[var(--text-secondary)]">
                            {t("settings_reader.gdpr_support_title", "Conformément au RGPD européen, téléchargez une copie complète de vos données au format portable JSON.")}
                          </span>
                          <span className="text-[var(--text-secondary)] leading-normal">
                            {t("settings_reader.gdpr_support_desc", "Pour toute demande relative au Règlement Général sur la Protection des Données (RGPD/GDPR) ou suppression définitive.")}
                          </span>
                          <a href="mailto:rgpd@qoe.fi" className="text-[var(--qoe-vermillion)] hover:underline font-semibold block mt-2">dpo@qoe.fi</a>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[var(--border-default)] text-[10px] text-[var(--text-tertiary)]">
                        <p className="leading-relaxed">
                          {t("settings_reader.footer_conviction", "qoe.fi est conçu avec pour valeurs la protection de l'attention et la souveraineté économique des créateurs de contenu en Europe. Nous n'utilisons aucun traceur tiers publicitaire.")}
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
