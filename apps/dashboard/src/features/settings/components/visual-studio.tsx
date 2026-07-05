// =====================================================================
// ⚡ QOE Visual Studio Component — apps/dashboard/src/features/settings/components/visual-studio.tsx
// =====================================================================
// Ultra-premium visual site builder & settings editor.
// Optimized for simplicity, performance, and responsive live pre-rendering.
// Features a collapsible live preview with sleek spring physics and glassmorphism.
// =====================================================================

"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { useTheme } from "next-themes"
import { useDebounce } from "use-debounce"
import { toast } from "sonner"
import {
  Paintbrush,
  Globe,
  Link as LinkIcon,
  Plus,
  Trash2,
  Check,
  Loader2,
  X,
  ExternalLink,
  AlignLeft,
  Type,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Laptop,
  Smartphone,
  Info,
  FileText,
  Layout,
  Eye,
  EyeOff,
  User,
  CheckCircle,
  HelpCircle,
  Sparkles,
  Palette
} from "lucide-react"

// Import Server Actions
import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction
} from "../actions"

// =====================================================================
// 🎨 TYPES & DATA DEFINITIONS
// =====================================================================

export interface ClientNavigationItem {
  id?: string
  label: string
  url: string | null
  order: number
  isExternal: boolean
}

export interface ClientSocialLink {
  id?: string
  platform: string
  url: string
  order: number
}

export interface StudioArticle {
  id: string
  title: string
  slug: string
  content: string | null
  published: boolean
  isPremium: boolean
  categoryId: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  createdAt: string
}

export interface ClientCategory {
  id: string
  name: string
  slug: string
}

export interface CreatorProfile {
  id: string
  email: string
  username: string | null
  name: string | null
  heroText: string | null
  accentColor: string | null
  fontFamily: string | null
  themeMode: string | null
  layoutStyle: string | null
  logoUrl: string | null
  headerImageUrl: string | null
  footerText: string | null
  seoTitle: string | null
  seoDescription: string | null
  allowIndexing: boolean
  supportUrl: string | null
  subdomain: string | null
  customDomain: string | null
  navigation: ClientNavigationItem[]
  socialLinks: ClientSocialLink[]
  articles: StudioArticle[]
  categories: ClientCategory[]
  advancedSettingsMode: boolean
}

// Predefined premium color palette
export const ACCENT_SWATCHES = [
  { id: "vermilion", name: "QOE Vermilion", hex: "#EE4B2B", bg: "bg-[#EE4B2B]" },
  { id: "emerald", name: "Emerald Green", hex: "#10B981", bg: "bg-[#10B981]" },
  { id: "royal", name: "Royal Blue", hex: "#3B82F6", bg: "bg-[#3B82F6]" },
  { id: "orchid", name: "Orchid Pink", hex: "#D946EF", bg: "bg-[#D946EF]" },
  { id: "amber", name: "Warm Amber", hex: "#F59E0B", bg: "bg-[#F59E0B]" },
  { id: "charcoal", name: "Anthracite", hex: "#1F2937", bg: "bg-[#1F2937]" },
]

export const SITE_FONTS = [
  { id: "sans", name: "Inter", family: "'Inter', sans-serif" },
  { id: "outfit", name: "Outfit", family: "'Outfit', sans-serif" },
  { id: "space-grotesk", name: "Space Grotesk", family: "'Space Grotesk', sans-serif" },
  { id: "serif", name: "Playfair Display", family: "'Playfair Display', serif" },
]

interface VisualStudioProps {
  initialCreator: CreatorProfile
}

type TabType = "identity" | "style" | "navigation" | "socials"

export default function VisualStudio({ initialCreator }: VisualStudioProps) {
  const { theme: dashboardTheme } = useTheme()

  // =====================================================================
  // 💾 STATE MANAGEMENT
  // =====================================================================
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator)
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator)
  
  const [activeTab, setActiveTab] = useState<TabType>("identity")
  const [showPreview, setShowPreview] = useState<boolean>(true)
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop")
  const [isSaving, setIsSaving] = useState(false)

  // Subdomain Validation State
  const [subdomainInput, setSubdomainInput] = useState(current.subdomain || "")
  const [debouncedSubdomain] = useDebounce(subdomainInput, 400)
  const [subdomainCheck, setSubdomainCheck] = useState<{
    loading: boolean
    available: boolean | null
    error: string | null
  }>({ loading: false, available: null, error: null })

  // Sync subdomain input with changes
  useEffect(() => {
    setSubdomainInput(current.subdomain || "")
  }, [current.subdomain])

  // Subdomain availability check
  useEffect(() => {
    if (debouncedSubdomain === original.subdomain) {
      setSubdomainCheck({ loading: false, available: null, error: null })
      return
    }
    if (!debouncedSubdomain) {
      setSubdomainCheck({ loading: false, available: false, error: "Le sous-domaine ne peut pas être vide." })
      return
    }

    async function check() {
      setSubdomainCheck({ loading: true, available: null, error: null })
      try {
        const res = await checkSubdomainAvailabilityAction(debouncedSubdomain)
        setSubdomainCheck({
          loading: false,
          available: res.available,
          error: res.error
        })
      } catch {
        setSubdomainCheck({
          loading: false,
          available: false,
          error: "Erreur lors de la vérification de la disponibilité."
        })
      }
    }
    check()
  }, [debouncedSubdomain, original.subdomain])

  // Determine active font stack
  const activeFont = SITE_FONTS.find(f => f.id === current.fontFamily) || SITE_FONTS[0]

  // Check if anything has been modified (baseline tracking)
  const hasChanges = JSON.stringify(current) !== JSON.stringify(original)

  // =====================================================================
  // ⚙️ MUTATION HANDLERS
  // =====================================================================

  const handleDiscardChanges = () => {
    setCurrent(original)
    toast.info("Modifications annulées.")
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    try {
      // 1. Save Profile Fields if changed
      const profileFieldsChanged = [
        "name", "heroText", "accentColor", "fontFamily", "logoUrl", "headerImageUrl", "footerText"
      ].some(field => current[field as keyof CreatorProfile] !== original[field as keyof CreatorProfile])

      if (profileFieldsChanged) {
        await updateCreatorProfileAction({
          name: current.name,
          heroText: current.heroText,
          accentColor: current.accentColor,
          fontFamily: current.fontFamily,
          logoUrl: current.logoUrl,
          headerImageUrl: current.headerImageUrl,
          footerText: current.footerText
        })
      }

      // 2. Save Subdomain if changed
      if (current.subdomain !== original.subdomain) {
        if (current.subdomain) {
          if (subdomainCheck.available === false) {
            throw new Error(`Sous-domaine invalide : ${subdomainCheck.error}`)
          }
          await updateSubdomainAction(current.subdomain)
        } else {
          await updateSubdomainAction("")
        }
      }

      // 3. Save Navigation links
      const navChanged = JSON.stringify(current.navigation) !== JSON.stringify(original.navigation)
      if (navChanged) {
        await saveNavigationLinksAction(current.navigation)
      }

      // 4. Save Social links
      const socialChanged = JSON.stringify(current.socialLinks) !== JSON.stringify(original.socialLinks)
      if (socialChanged) {
        await saveSocialLinksAction(current.socialLinks)
      }

      toast.success("Paramètres enregistrés et publiés avec succès !")
      setOriginal(current)
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde.")
    } finally {
      setIsSaving(false)
    }
  }

  // Navigation Links Helpers
  const addNavigationLink = () => {
    const newLink: ClientNavigationItem = {
      label: "Nouveau Lien",
      url: "https://",
      order: current.navigation.length,
      isExternal: true
    }
    setCurrent(prev => ({ ...prev, navigation: [...prev.navigation, newLink] }))
  }

  const removeNavigationLink = (idx: number) => {
    setCurrent(prev => {
      const filtered = prev.navigation.filter((_, i) => i !== idx)
      return { ...prev, navigation: filtered.map((item, i) => ({ ...item, order: i })) }
    })
  }

  const reorderNavigationLink = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return
    if (direction === "down" && idx === current.navigation.length - 1) return

    setCurrent(prev => {
      const items = [...prev.navigation]
      const target = direction === "up" ? idx - 1 : idx + 1
      const temp = items[idx]
      items[idx] = items[target]
      items[target] = temp
      return { ...prev, navigation: items.map((item, i) => ({ ...item, order: i })) }
    })
  }

  // Social Links Helpers
  const addSocialLink = (platform: string) => {
    // Prevent duplicated platforms to keep it simple
    if (current.socialLinks.some(s => s.platform === platform)) {
      toast.warning(`Le lien ${platform} existe déjà.`)
      return
    }
    const newSocial: ClientSocialLink = {
      platform,
      url: `https://${platform}.com/`,
      order: current.socialLinks.length
    }
    setCurrent(prev => ({ ...prev, socialLinks: [...prev.socialLinks, newSocial] }))
  }

  const removeSocialLink = (idx: number) => {
    setCurrent(prev => {
      const filtered = prev.socialLinks.filter((_, i) => i !== idx)
      return { ...prev, socialLinks: filtered.map((item, i) => ({ ...item, order: i })) }
    })
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#FCFBF9] text-neutral-900 relative font-sans">
      {/* Dynamic Font Loader */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Outfit:wght@400;500;600;700;900&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap" />

      {/* =====================================================================
          👈 LEFT/CENTER WORKSPACE: RETRACTABLE LIVE PREVIEW OR FORM PREVIEW
          ===================================================================== */}
      <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#fbfaf8] relative border-r border-neutral-200">
        
        {/* Top Control Panel */}
        <div className="w-full h-14 border-b border-neutral-200 bg-white/80 backdrop-blur-md px-6 flex items-center justify-between z-10 select-none">
          <div className="flex items-center gap-4">
            {/* Visual Studio branding signature */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#EE4B2B]" />
              <span className="text-xs uppercase font-bold tracking-widest text-neutral-400">Visual Studio</span>
            </div>
            
            {/* Toggle Preview Button */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-50 border border-neutral-200 text-xs font-bold text-neutral-700 hover:text-neutral-900 transition-all cursor-pointer shadow-sm"
            >
              {showPreview ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Masquer l'aperçu</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[#EE4B2B]" />
                  <span>Afficher l'aperçu</span>
                </>
              )}
            </button>
          </div>

          {/* Browser Address Bar (Shown only when preview is active) */}
          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 max-w-sm mx-6 hidden md:flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl bg-neutral-100/60 border border-neutral-200 text-[11px] font-mono text-neutral-500"
              >
                <span className="text-[#EE4B2B] font-black select-none">https://</span>
                <span className="font-bold text-neutral-700">{current.subdomain || "votre-site"}</span>
                <span className="text-neutral-400 font-semibold">.qoe.fi</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Device and status triggers */}
          <div className="flex items-center gap-2">
            {showPreview && (
              <div className="flex items-center gap-0.5 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
                <button
                  onClick={() => setPreviewDevice("desktop")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    previewDevice === "desktop" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-400 hover:text-neutral-700"
                  }`}
                  title="Aperçu Ordinateur"
                >
                  <Laptop className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewDevice("mobile")}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    previewDevice === "mobile" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-400 hover:text-neutral-700"
                  }`}
                  title="Aperçu Mobile"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {!showPreview && (
              <span className="text-[10px] font-black uppercase bg-neutral-100 border border-neutral-200 text-neutral-500 px-2.5 py-1 rounded-lg">
                Formulaire Étendu
              </span>
            )}
          </div>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 w-full flex items-center justify-center p-6 overflow-auto bg-[radial-gradient(rgba(238,75,43,0.04)_1px,transparent_1px)] [background-size:20px_24px]">
          
          <AnimatePresence mode="wait">
            {showPreview ? (
              /* PREVIEW ACTIVE: Renders the site mockup in real time */
              <motion.div
                key="preview-container"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                style={{
                  width: previewDevice === "desktop" ? "100%" : "375px",
                  height: previewDevice === "desktop" ? "100%" : "720px",
                  maxWidth: "100%",
                  maxHeight: "100%"
                }}
                className={`bg-white border border-neutral-200 shadow-2xl flex flex-col overflow-hidden relative transition-all duration-300 ${
                  previewDevice === "mobile" ? "rounded-[2.5rem] border-8 border-neutral-900 shadow-[0_25px_60px_rgba(0,0,0,0.2)]" : "rounded-xl"
                }`}
              >
                {/* Dynamic variables injection based on local state */}
                <div
                  style={{
                    "--live-accent": current.accentColor || "#EE4B2B",
                    fontFamily: activeFont.family
                  } as React.CSSProperties}
                  className="w-full h-full overflow-y-auto flex flex-col bg-[#FAF9F6] text-neutral-900 transition-colors select-none"
                >
                  <div className="min-h-full flex flex-col flex-1 pb-12">
                    
                    {/* Header Live Preview component */}
                    <header className="border-b border-neutral-200/60 bg-white/80 backdrop-blur-md py-4 sticky top-0 z-30 px-6 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {current.logoUrl ? (
                          <img src={current.logoUrl} alt="Logo" className="w-6 h-6 rounded-full object-cover border border-neutral-200" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--live-accent)]/10 flex items-center justify-center font-bold text-[10px]" style={{ color: "var(--live-accent)" }}>
                            {current.name?.charAt(0) || "Q"}
                          </div>
                        )}
                        <span className="text-xs font-black tracking-tight">{current.name || "Sans Nom"}</span>
                      </div>

                      {/* Header Custom links preview */}
                      <nav className="flex items-center gap-3 text-[10px] font-semibold text-neutral-500">
                        {current.navigation.slice(0, 3).map((link, idx) => (
                          <span key={idx} className="hover:text-neutral-900">
                            {link.label}
                          </span>
                        ))}
                        {current.navigation.length === 0 && (
                          <span className="text-[9px] italic text-neutral-300">Aucun lien</span>
                        )}
                      </nav>
                    </header>

                    {/* Banner Image Preview */}
                    <div className="relative w-full h-24 bg-neutral-100 flex items-center justify-center overflow-hidden border-b border-neutral-200/40">
                      {current.headerImageUrl ? (
                        <>
                          <div className="absolute inset-0 bg-neutral-950/10 z-10" />
                          <img src={current.headerImageUrl} alt="Bannière" className="w-full h-full object-cover" />
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Pas d'image de couverture</span>
                        </div>
                      )}
                    </div>

                    {/* Hero Information Preview */}
                    <section className="px-6 py-10 text-center max-w-xl mx-auto space-y-3">
                      <h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight text-neutral-900">
                        {current.name || "Nouveau Créateur"}
                      </h1>
                      <p className="text-xs text-neutral-500 font-medium leading-relaxed max-w-sm mx-auto whitespace-pre-line">
                        {current.heroText || "Ajoutez un message de bienvenue pour accrocher vos lecteurs."}
                      </p>
                    </section>

                    {/* Mock Articles Section */}
                    <main className="px-6 py-6 border-t border-neutral-200/50 max-w-lg mx-auto w-full flex-1">
                      <div className="flex items-center justify-between mb-4 pb-1.5 border-b border-neutral-200/50">
                        <span className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Publications</span>
                        <span className="text-[9px] font-bold text-neutral-400">En direct</span>
                      </div>
                      
                      {/* Live feedback loop of articles */}
                      <div className="space-y-3">
                        {current.articles.slice(0, 1).map((art, i) => (
                          <div key={art.id || i} className="p-3.5 bg-white border border-neutral-200/60 rounded-xl space-y-1.5">
                            <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: "var(--live-accent)" }}>
                              {current.categories.find(c => c.id === art.categoryId)?.name || "GÉNÉRAL"}
                            </span>
                            <h4 className="text-xs font-bold text-neutral-900">{art.title || "Titre de l'article"}</h4>
                            <p className="text-[10px] text-neutral-400 line-clamp-1">{art.content || "Contenu rédigé..."}</p>
                          </div>
                        ))}
                        {current.articles.length === 0 && (
                          <div className="p-4 border border-dashed rounded-xl text-center text-[10px] text-neutral-400">
                            Aucune publication. Configurez vos articles depuis votre console.
                          </div>
                        )}
                      </div>
                    </main>

                    {/* Footer Mock View */}
                    <footer className="border-t border-neutral-200/50 bg-neutral-50 py-8 px-6 text-center mt-auto">
                      <div className="max-w-xs mx-auto space-y-3">
                        <p className="text-[10px] text-neutral-400 font-medium leading-normal whitespace-pre-line">
                          {current.footerText || "Merci de votre visite !"}
                        </p>

                        {/* Social Links List */}
                        {current.socialLinks.length > 0 && (
                          <div className="flex justify-center flex-wrap gap-2.5 pt-1">
                            {current.socialLinks.map((soc, idx) => (
                              <span
                                key={idx}
                                className="text-[8px] font-bold uppercase px-2 py-0.5 bg-neutral-200/50 rounded-md text-neutral-600 border border-neutral-300/40"
                              >
                                {soc.platform}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[8px] text-neutral-300 font-bold pt-1">© {new Date().getFullYear()} • qoe.fi</p>
                      </div>
                    </footer>

                  </div>
                </div>
              </motion.div>
            ) : (
              /* PREVIEW COLLAPSED: Form layout centers beautifully inside glass container */
              <motion.div
                key="form-expanded-container"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-xl bg-white/40 border border-neutral-200 rounded-3xl p-8 shadow-[0_30px_70px_rgba(0,0,0,0.08)] backdrop-blur-xl relative"
              >
                {/* Visual Accent gradient blur behind */}
                <div className="absolute -top-12 -left-12 w-48 h-48 bg-[#EE4B2B]/10 rounded-full blur-[40px] pointer-events-none" />
                <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-[#EE4B2B]/5 rounded-full blur-[40px] pointer-events-none" />

                <div className="relative z-10 space-y-6">
                  {/* Explanatory helper header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-neutral-100">
                    <div className="p-2 rounded-xl bg-[#EE4B2B]/10 text-[#EE4B2B]">
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider">Ajustements Studio</h2>
                        La prévisualisation est masquée pour préserver vos performances. Modifiez vos options à droite en toute légèreté.
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Live configuration metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex flex-col gap-1.5">
                        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-wider">Sous-domaine</span>
                        <span className="text-xs font-bold text-neutral-800 truncate">
                          {current.subdomain ? `${current.subdomain}.qoe.fi` : "Non configuré"}
                        </span>
                      </div>
                      <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex flex-col gap-1.5">
                        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-wider">Identité</span>
                        <span className="text-xs font-bold text-neutral-800 truncate">
                          {current.name || "Non nommé"}
                        </span>
                      </div>
                      <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex flex-col gap-1.5">
                        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-wider">Couleur d'accent</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: current.accentColor || "#EE4B2B" }} />
                          <span className="text-xs font-bold text-neutral-800 font-mono">
                            {current.accentColor || "#EE4B2B"}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex flex-col gap-1.5">
                        <span className="text-[9px] uppercase font-black text-neutral-500 tracking-wider">Police Active</span>
                        <span className="text-xs font-bold text-neutral-800" style={{ fontFamily: activeFont.family }}>
                          {activeFont.name}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 flex items-center gap-3">
                      <Info className="w-4 h-4 text-[#EE4B2B] shrink-0" />
                      <p className="text-[10px] text-neutral-600 leading-relaxed">
                        Toutes vos modifications sont en attente d'enregistrement. Utilisez la barre de commande flottante en bas de l'écran pour valider.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* =====================================================================
          👉 RIGHT SIDEBAR (360px): CONFIGURATION PROPERTY INSPECTOR
          ===================================================================== */}
      <div className="w-[360px] shrink-0 border-l border-neutral-200 h-full overflow-y-auto flex flex-col bg-white select-none">
        
        {/* Selector Tabs Header */}
        <div className="grid grid-cols-4 gap-0.5 p-1.5 bg-white border-b border-neutral-100">
          {(
            [
              { id: "identity", label: "Profil", icon: User },
              { id: "style", label: "Style", icon: Palette },
              { id: "navigation", label: "Menu", icon: LinkIcon },
              { id: "socials", label: "Réseaux", icon: Globe }
            ] as const
          ).map(tab => {
            const Icon = tab.icon
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white text-neutral-900 border border-neutral-200 shadow-sm"
                    : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5 mb-1" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: IDENTITY */}
            {activeTab === "identity" && (
              <motion.div
                key="tab-identity"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="pb-3 border-b border-neutral-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800">Identité & Adresse</h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Configurez l'accroche et l'adresse de votre espace.</p>
                </div>

                {/* Subdomain Input with Live Checker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block text-neutral-400">Adresse Web (Sous-domaine)</label>
                  <div className="relative">
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={subdomainInput}
                        onChange={e => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                          setSubdomainInput(val)
                          setCurrent(prev => ({ ...prev, subdomain: val }))
                        }}
                        className="px-3 py-2 bg-neutral-50 text-xs font-bold rounded-l-lg border border-neutral-200 focus:outline-none w-full text-neutral-900 font-mono lowercase"
                        placeholder="mon-espace"
                      />
                      <span className="px-3 py-2 bg-neutral-100 text-neutral-500 border border-neutral-200 border-l-0 rounded-r-lg text-[10px] font-bold font-mono">
                        .qoe.fi
                      </span>
                    </div>

                    {/* Subdomain availability overlay feedback */}
                    <div className="absolute right-24 top-1/2 -translate-y-1/2 flex items-center pr-1.5">
                      {subdomainCheck.loading && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" />
                      )}
                      {!subdomainCheck.loading && subdomainCheck.available === true && (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                      {!subdomainCheck.loading && subdomainCheck.available === false && (
                        <X className="w-3.5 h-3.5 text-red-500" />
                      )}
                    </div>
                  </div>

                  {subdomainCheck.error && (
                    <div className="flex items-center gap-1 text-[9px] text-red-400 font-bold bg-red-950/20 p-2 rounded-lg border border-red-900/30">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{subdomainCheck.error}</span>
                    </div>
                  )}
                  {subdomainCheck.available === true && (
                    <p className="text-[9px] text-emerald-500 font-bold">Cette adresse est disponible !</p>
                  )}
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block text-neutral-400">Nom d'affichage</label>
                  <input
                    type="text"
                    value={current.name || ""}
                    onChange={e => setCurrent(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex. Sarah Connor"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-neutral-50 text-neutral-900 font-bold focus:outline-none focus:border-neutral-300 focus:ring-1 focus:ring-neutral-300"
                  />
                </div>

                {/* Hero Biography */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block text-neutral-400">Message de bienvenue (Bio)</label>
                  <textarea
                    value={current.heroText || ""}
                    onChange={e => setCurrent(prev => ({ ...prev, heroText: e.target.value }))}
                    placeholder="Ex. Écrivaine et journalist. Bienvenue sur mon journal de bord..."
                    rows={3}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-neutral-50 text-neutral-800 font-semibold focus:outline-none resize-none focus:border-neutral-300 focus:ring-1 focus:ring-neutral-300"
                  />
                </div>

                {/* Avatar Logo URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block text-neutral-400">URL de l'Avatar / Logo</label>
                  <input
                    type="text"
                    value={current.logoUrl || ""}
                    onChange={e => setCurrent(prev => ({ ...prev, logoUrl: e.target.value }))}
                    placeholder="https://... URL"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-neutral-50 text-neutral-600 font-mono text-[10px] focus:outline-none focus:border-neutral-300 focus:ring-1 focus:ring-neutral-300"
                  />
                </div>

                {/* Cover Banner URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block text-neutral-400">URL de l'Image de Couverture</label>
                  <input
                    type="text"
                    value={current.headerImageUrl || ""}
                    onChange={e => setCurrent(prev => ({ ...prev, headerImageUrl: e.target.value }))}
                    placeholder="https://images.unsplash.com/... cover image"
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-neutral-50 text-neutral-600 font-mono text-[10px] focus:outline-none focus:border-neutral-300 focus:ring-1 focus:ring-neutral-300"
                  />
                </div>
              </motion.div>
            )}

            {/* TAB 2: VISUAL STYLE */}
            {activeTab === "style" && (
              <motion.div
                key="tab-style"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="pb-3 border-b border-neutral-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800">Style Visuel</h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Personnalisez l'ambiance et la typographie de votre site.</p>
                </div>

                {/* Font Choices */}
                <div className="space-y-2">
                  <label className="text-xs font-bold block text-neutral-400">Famille de Polices</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SITE_FONTS.map(font => {
                      const isSelected = current.fontFamily === font.id
                      return (
                        <button
                          key={font.id}
                          onClick={() => setCurrent(prev => ({ ...prev, fontFamily: font.id }))}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 cursor-pointer transition-all ${
                            isSelected
                              ? "border-[#EE4B2B] bg-[#EE4B2B]/5 shadow-[0_4px_20px_rgba(238,75,43,0.15)]"
                              : "border-neutral-100 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-200"
                          }`}
                        >
                          <span className="text-sm font-black" style={{ fontFamily: font.family }}>Aa</span>
                          <span className="text-[9px] font-bold text-neutral-400 leading-none">{font.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Custom and Predefined Accents */}
                <div className="space-y-3">
                  <label className="text-xs font-bold block text-neutral-400">Couleur d'accentuation</label>
                  
                  {/* Swatches Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {ACCENT_SWATCHES.map(swatch => {
                      const isSelected = current.accentColor?.toLowerCase() === swatch.hex.toLowerCase()
                      return (
                        <button
                          key={swatch.id}
                          onClick={() => setCurrent(prev => ({ ...prev, accentColor: swatch.hex }))}
                          className={`p-2 rounded-xl border flex items-center gap-2 text-left cursor-pointer transition-all ${
                            isSelected
                              ? "border-[#EE4B2B] bg-[#EE4B2B]/5"
                              : "border-neutral-100 bg-neutral-50 hover:bg-neutral-100"
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-full ${swatch.bg} border border-neutral-950/20`} />
                          <span className="text-[9px] font-bold text-neutral-600 truncate">{swatch.name.split(" ")[0]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Hex Color Picker */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="color"
                      value={current.accentColor || "#EE4B2B"}
                      onChange={e => setCurrent(prev => ({ ...prev, accentColor: e.target.value }))}
                      className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent shrink-0"
                    />
                    <input
                      type="text"
                      value={current.accentColor || "#EE4B2B"}
                      onChange={e => setCurrent(prev => ({ ...prev, accentColor: e.target.value }))}
                      placeholder="#EE4B2B"
                      className="px-3 py-1.5 border border-neutral-200 rounded bg-neutral-50 text-xs font-mono font-bold w-full text-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Footer Text Area */}
                <div className="space-y-1.5 pt-3 border-t border-neutral-100">
                  <label className="text-xs font-bold block text-neutral-400">Texte du Pied de Page</label>
                  <textarea
                    value={current.footerText || ""}
                    onChange={e => setCurrent(prev => ({ ...prev, footerText: e.target.value }))}
                    placeholder="Saisissez un message de bas de page ou d'au revoir..."
                    rows={2}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-xs bg-neutral-50 text-neutral-700 font-semibold focus:outline-none resize-none focus:border-neutral-300 focus:ring-1 focus:ring-neutral-300"
                  />
                </div>
              </motion.div>
            )}

            {/* TAB 3: NAVIGATION MENU LINKS */}
            {activeTab === "navigation" && (
              <motion.div
                key="tab-navigation"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="pb-3 border-b border-neutral-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800">Menu de Navigation</h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Gérez les onglets d'en-tête de votre site.</p>
                  </div>
                  <button
                    onClick={addNavigationLink}
                    className="flex items-center gap-1 text-[10px] font-black text-white hover:text-white bg-[#EE4B2B] hover:bg-[#ff5d40] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Ajouter</span>
                  </button>
                </div>

                {current.navigation.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-400 bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl">
                    Aucun lien personnalisé dans le menu.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    <LayoutGroup id="nav-item-layout">
                      {current.navigation.map((nav, idx) => (
                        <motion.div
                          layout
                          key={idx}
                          className="flex items-center gap-2 p-3 border border-neutral-200 bg-white rounded-xl relative shadow-sm"
                        >
                          {/* Reordering indicators */}
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              disabled={idx === 0}
                              onClick={() => reorderNavigationLink(idx, "up")}
                              className="p-0.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 cursor-pointer transition-colors"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              disabled={idx === current.navigation.length - 1}
                              onClick={() => reorderNavigationLink(idx, "down")}
                              className="p-0.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-20 cursor-pointer transition-colors"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Text/URL configuration */}
                          <div className="grid grid-cols-2 gap-1.5 flex-1">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-neutral-400 uppercase">Titre</span>
                              <input
                                type="text"
                                value={nav.label}
                                onChange={e => {
                                  const updated = [...current.navigation]
                                  updated[idx] = { ...updated[idx], label: e.target.value }
                                  setCurrent(prev => ({ ...prev, navigation: updated }))
                                }}
                                className="w-full px-2 py-1.5 text-[10px] border border-neutral-200 rounded bg-neutral-50 text-neutral-900 font-bold focus:outline-none"
                                placeholder="Onglet"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-neutral-400 uppercase">Lien</span>
                              <input
                                type="text"
                                value={nav.url || ""}
                                onChange={e => {
                                  const updated = [...current.navigation]
                                  updated[idx] = { ...updated[idx], url: e.target.value }
                                  setCurrent(prev => ({ ...prev, navigation: updated }))
                                }}
                                className="w-full px-2 py-1.5 text-[10px] border border-neutral-200 rounded bg-neutral-50 text-neutral-600 font-mono focus:outline-none"
                                placeholder="https://"
                              />
                            </div>
                          </div>

                          {/* Delete Item */}
                          <button
                            onClick={() => removeNavigationLink(idx)}
                            className="p-1 text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer shrink-0 mt-3"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </LayoutGroup>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: SOCIAL NETWORKS */}
            {activeTab === "socials" && (
              <motion.div
                key="tab-socials"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="pb-3 border-b border-neutral-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-neutral-800">Réseaux Sociaux</h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Ajoutez vos profils pour connecter vos communautés.</p>
                </div>

                {/* Add Quick Button Shortcuts */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 block">Plateformes Supportées</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(["twitter", "github", "instagram", "youtube"] as const).map(plat => {
                      const isConnected = current.socialLinks.some(s => s.platform === plat)
                      return (
                        <button
                          key={plat}
                          disabled={isConnected}
                          onClick={() => addSocialLink(plat)}
                          className={`text-[9px] font-black uppercase px-2 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isConnected
                              ? "bg-neutral-50 border-neutral-100 text-neutral-300 cursor-not-allowed"
                              : "bg-[#EE4B2B]/10 border-[#EE4B2B]/20 text-[#EE4B2B] hover:bg-[#EE4B2B] hover:text-white"
                          }`}
                        >
                          +{plat}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Existing Connections List */}
                <div className="space-y-2 pt-3 border-t border-neutral-100">
                  <span className="text-xs font-bold text-neutral-500 block">Liens Configurés</span>

                  {current.socialLinks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-neutral-500 bg-neutral-950 border border-dashed border-neutral-900 rounded-2xl">
                      Aucun profil social connecté.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {current.socialLinks.map((soc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 p-3 border border-neutral-200 bg-white rounded-xl shadow-sm"
                        >
                          {/* Platform badge display */}
                          <span className="text-[9px] font-black uppercase text-[#EE4B2B] bg-[#EE4B2B]/5 px-2.5 py-1 rounded-lg border border-[#EE4B2B]/10 w-16 text-center select-none shrink-0 capitalize">
                            {soc.platform}
                          </span>

                          <input
                            type="text"
                            value={soc.url}
                            onChange={e => {
                              const updated = [...current.socialLinks]
                              updated[idx] = { ...updated[idx], url: e.target.value }
                              setCurrent(prev => ({ ...prev, socialLinks: updated }))
                            }}
                            className="px-2 py-1.5 text-[10px] border border-neutral-200 bg-neutral-50 rounded flex-1 font-mono text-neutral-600 focus:outline-none"
                            placeholder="https://"
                          />

                          <button
                            onClick={() => removeSocialLink(idx)}
                            className="p-1 text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* =====================================================================
          💾 FLOATING SAVE DOCK (Animated Framer-Motion Command Bar)
          ===================================================================== */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 80, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 80, x: "-50%" }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-6 left-1/2 z-50 flex items-center justify-between gap-6 px-5 py-4 bg-white/95 border border-neutral-200 text-neutral-900 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.12)] backdrop-blur-md w-[90%] max-w-lg select-none"
          >
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-neutral-800">Modifications non publiées</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Enregistrez pour synchroniser vos paramètres.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={isSaving}
                onClick={handleDiscardChanges}
                className="px-3.5 py-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              
              <button
                disabled={isSaving}
                onClick={handleSaveAll}
                className="px-4 py-1.5 text-xs font-black text-white bg-[#EE4B2B] hover:bg-[#ff5d40] rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_4px_20px_rgba(238,75,43,0.3)] disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Enregistrer</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
