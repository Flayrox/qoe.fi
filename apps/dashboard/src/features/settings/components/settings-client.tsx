"use client"

import React, { useState, useEffect, useRef, useTransition } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import {
  Paintbrush,
  Settings2,
  Globe,
  Link as LinkIcon,
  Plus,
  Trash2,
  Save,
  Check,
  Loader2,
  X,
  ExternalLink,
  AlignLeft,
  Type,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Laptop,
  Smartphone,
  Info,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import { useDebounce } from "use-debounce"
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

export interface NavigationItem {
  id?: string
  label: string
  url: string | null
  order: number
  isExternal: boolean
}

export interface SocialLink {
  id?: string
  platform: string
  url: string
  order: number
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
  navigation: NavigationItem[]
  socialLinks: SocialLink[]
}

export interface ThemePreset {
  id: string
  name: string
  themeMode: string
  accentColor: string
  bg: string
  fg: string
  cardBg: string
  border: string
  secondaryBg: string
  mutedText: string
  desc: string
}

export const SITE_THEMES: ThemePreset[] = [
  {
    id: "classic",
    name: "Classic Vermilion",
    themeMode: "classic",
    accentColor: "#EE4B2B",
    bg: "#ffffff",
    fg: "#09090b",
    cardBg: "#ffffff",
    border: "#e4e4e7",
    secondaryBg: "#f4f4f5",
    mutedText: "#71717a",
    desc: "Épuré blanc avec des détails d'accent orange-rouge vermillon.",
  },
  {
    id: "vercel-dark",
    name: "Vercel Obsidian",
    themeMode: "vercel-dark",
    accentColor: "#ffffff",
    bg: "#09090b",
    fg: "#fafafa",
    cardBg: "#18181b",
    border: "#27272a",
    secondaryBg: "#18181b",
    mutedText: "#a1a1aa",
    desc: "Noir profond premium avec des contrastes gris techniques et accents blancs.",
  },
  {
    id: "matcha",
    name: "Matcha Tea",
    themeMode: "matcha",
    accentColor: "#4A5D4E",
    bg: "#F4F7F4",
    fg: "#2C3531",
    cardBg: "#E8EFEA",
    border: "#D1DDD7",
    secondaryBg: "#E8EFEA",
    mutedText: "#5C6B5F",
    desc: "Pastel crème apaisant, détails vert sauge et écriture matcha.",
  },
  {
    id: "sakura",
    name: "Sakura Blossom",
    themeMode: "sakura",
    accentColor: "#D06D8C",
    bg: "#FFF5F7",
    fg: "#3D2B3D",
    cardBg: "#FFE3E9",
    border: "#FFD0D9",
    secondaryBg: "#FFE3E9",
    mutedText: "#7D5D72",
    desc: "Teinte printanière florale rose pastel doux et violet foncé.",
  }
]

interface SettingsClientProps {
  initialCreator: CreatorProfile
}

type TabType = "identity" | "theme" | "navigation" | "subdomain"

export default function SettingsClient({ initialCreator }: SettingsClientProps) {
  // =====================================================================
  // 💾 STATE MANAGEMENT
  // =====================================================================
  const [formData, setFormData] = useState<CreatorProfile>(initialCreator)
  const [activeTab, setActiveTab] = useState<TabType>("identity")
  const [isPending, startTransition] = useTransition()
  
  // Direct manipulation active element
  const [activeEditElement, setActiveEditElement] = useState<string | null>(null)
  const [toolbarCoordinates, setToolbarCoordinates] = useState<{ x: number; y: number } | null>(null)
  
  // Preview responsiveness configuration
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop")

  // Subdomain validation state
  const [subdomainInput, setSubdomainInput] = useState(formData.subdomain || "")
  const [debouncedSubdomain] = useDebounce(subdomainInput, 400)
  const [subdomainCheckResult, setSubdomainCheckResult] = useState<{
    available: boolean | null
    error: string | null
    loading: boolean
  }>({ available: null, error: null, loading: false })

  // Refs for focusing settings inputs from preview clicks
  const nameInputRef = useRef<HTMLInputElement>(null)
  const heroTextInputRef = useRef<HTMLTextAreaElement>(null)
  const footerTextInputRef = useRef<HTMLInputElement>(null)
  const accentColorRef = useRef<HTMLInputElement>(null)

  // Calculate if there are unsaved changes
  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialCreator)

  // =====================================================================
  // 🔍 SUBDOMAIN CHECK EFFECT
  // =====================================================================
  useEffect(() => {
    if (debouncedSubdomain === initialCreator.subdomain) {
      setSubdomainCheckResult({ available: null, error: null, loading: false })
      return
    }

    if (!debouncedSubdomain) {
      setSubdomainCheckResult({ available: false, error: "Le sous-domaine ne peut pas être vide.", loading: false })
      return
    }

    async function checkSubdomain() {
      setSubdomainCheckResult(prev => ({ ...prev, loading: true }))
      try {
        const res = await checkSubdomainAvailabilityAction(debouncedSubdomain)
        setSubdomainCheckResult({
          available: res.available,
          error: res.error,
          loading: false
        })
      } catch (err: any) {
        setSubdomainCheckResult({
          available: false,
          error: "Une erreur est survenue lors de la vérification.",
          loading: false
        })
      }
    }

    checkSubdomain()
  }, [debouncedSubdomain, initialCreator.subdomain])

  // Sync subdomain changes in form data
  useEffect(() => {
    setFormData(prev => ({ ...prev, subdomain: subdomainInput }))
  }, [subdomainInput])

  // Reset activeEditElement if clicking elsewhere
  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      // If clicked element has a parent with data-no-dismiss or class edit-element, do not dismiss
      const target = e.target as HTMLElement
      if (target.closest("[data-no-dismiss]") || target.closest(".edit-indicator")) {
        return
      }
      setActiveEditElement(null)
      setToolbarCoordinates(null)
    }
    document.addEventListener("mousedown", handleGlobalClick)
    return () => document.removeEventListener("mousedown", handleGlobalClick)
  }, [])

  // Get current active theme config
  const currentThemePreset = SITE_THEMES.find(t => t.id === formData.themeMode) || SITE_THEMES[0]

  // =====================================================================
  // ⚙️ MUTATIONS / ACTIONS HANDLERS
  // =====================================================================
  const handleSaveAll = async () => {
    startTransition(async () => {
      try {
        // 1. Update basic profile features
        await updateCreatorProfileAction({
          name: formData.name,
          heroText: formData.heroText,
          accentColor: formData.accentColor,
          fontFamily: formData.fontFamily,
          themeMode: formData.themeMode,
          layoutStyle: formData.layoutStyle,
          logoUrl: formData.logoUrl,
          headerImageUrl: formData.headerImageUrl,
          footerText: formData.footerText,
          seoTitle: formData.seoTitle,
          seoDescription: formData.seoDescription,
          allowIndexing: formData.allowIndexing,
          supportUrl: formData.supportUrl,
        })

        // 2. Save Subdomain if changed and validated
        if (formData.subdomain !== initialCreator.subdomain) {
          if (formData.subdomain && subdomainCheckResult.available) {
            await updateSubdomainAction(formData.subdomain)
          } else if (!formData.subdomain) {
            await updateSubdomainAction("")
          } else if (subdomainCheckResult.error) {
            throw new Error(`Sous-domaine invalide : ${subdomainCheckResult.error}`)
          }
        }

        // 3. Save Navigation Links
        await saveNavigationLinksAction(formData.navigation)

        // 4. Save Social Links
        await saveSocialLinksAction(formData.socialLinks)

        toast.success("Interface créateur sauvegardée avec succès !")
        
        // Refresh local view by overwriting initialCreator parameters with successfully saved data
        // Next.js handles server component updates in the background.
        window.location.reload()
      } catch (error: any) {
        console.error(error)
        toast.error(error.message || "Erreur lors de la sauvegarde.")
      }
    })
  }

  const handleDiscardChanges = () => {
    setFormData(initialCreator)
    setSubdomainInput(initialCreator.subdomain || "")
    setActiveEditElement(null)
    setToolbarCoordinates(null)
    toast.info("Modifications annulées.")
  }

  // =====================================================================
  // 🖱️ DIRECT MANIPULATION CLICK INTERCEPTOR
  // =====================================================================
  const handlePreviewElementClick = (
    elementId: string, 
    tabToOpen: TabType, 
    inputRefToFocus: React.RefObject<any>, 
    event: React.MouseEvent
  ) => {
    event.stopPropagation()
    setActiveTab(tabToOpen)
    setActiveEditElement(elementId)

    // Calculate toolbar coordinates relative to the preview canvas mockup bounds
    const rect = event.currentTarget.getBoundingClientRect()
    const containerRect = document.getElementById("canvas-mockup-container")?.getBoundingClientRect()
    
    if (containerRect) {
      setToolbarCoordinates({
        x: rect.left - containerRect.left + (rect.width / 2) - 130, // Centered
        y: rect.top - containerRect.top - 55 // Floats above
      })
    }

    // Scroll to panel input and focus it smoothly
    setTimeout(() => {
      if (inputRefToFocus?.current) {
        inputRefToFocus.current.scrollIntoView({ behavior: "smooth", block: "center" })
        inputRefToFocus.current.focus()
      }
    }, 150)
  }

  // =====================================================================
  // ➕➖ LINKS AND SOCIAL BUILDERS HELPERS
  // =====================================================================
  const addNavigationLink = () => {
    const newLink: NavigationItem = {
      label: "Nouveau Lien",
      url: "https://",
      order: formData.navigation.length,
      isExternal: true
    }
    setFormData(prev => ({
      ...prev,
      navigation: [...prev.navigation, newLink]
    }))
  }

  const removeNavigationLink = (index: number) => {
    setFormData(prev => {
      const updated = prev.navigation.filter((_, i) => i !== index)
      // Re-index
      return {
        ...prev,
        navigation: updated.map((item, i) => ({ ...item, order: i }))
      }
    })
  }

  const moveNavigationLink = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return
    if (direction === "down" && index === formData.navigation.length - 1) return

    setFormData(prev => {
      const links = [...prev.navigation]
      const targetIndex = direction === "up" ? index - 1 : index + 1
      const temp = links[index]
      links[index] = links[targetIndex]
      links[targetIndex] = temp

      return {
        ...prev,
        navigation: links.map((link, i) => ({ ...link, order: i }))
      }
    })
  }

  const addSocialLink = (platform: string) => {
    const newSocial: SocialLink = {
      platform,
      url: `https://${platform}.com/`,
      order: formData.socialLinks.length
    }
    setFormData(prev => ({
      ...prev,
      socialLinks: [...prev.socialLinks, newSocial]
    }))
  }

  const removeSocialLink = (index: number) => {
    setFormData(prev => {
      const updated = prev.socialLinks.filter((_, i) => i !== index)
      return {
        ...prev,
        socialLinks: updated.map((item, i) => ({ ...item, order: i }))
      }
    })
  }

  return (
    <div className="relative min-h-[calc(100vh-10rem)] w-full flex flex-col xl:flex-row gap-8">
      {/* =====================================================================
          👉 LEFT SIDEBAR: DETAILED FORMS & SETTINGS
          ===================================================================== */}
      <div className="w-full xl:w-[45%] flex flex-col bg-card border border-border/60 rounded-3xl p-6 shadow-xl h-fit overflow-y-auto">
        <div className="flex items-center justify-between pb-6 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Personnaliser le Site</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Modifiez votre site directement ou via les réglages.</p>
            </div>
          </div>
          
          {/* Subtle auto-saved preview */}
          {hasChanges && (
            <span className="flex items-center gap-1.5 text-xs text-amber-500 font-medium px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Modifié
            </span>
          )}
        </div>

        {/* Tab Selectors */}
        <div className="grid grid-cols-4 gap-1 p-1.5 bg-muted/60 rounded-xl my-6">
          {(
            [
              { id: "identity", label: "Identité", icon: AlignLeft },
              { id: "theme", label: "Thèmes", icon: Paintbrush },
              { id: "navigation", label: "Liens", icon: LinkIcon },
              { id: "subdomain", label: "Nom de domaine", icon: Globe }
            ] as const
          ).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col md:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm scale-[1.02]"
                    : "text-muted-foreground hover:bg-background/20 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ==================== TAB: IDENTITY ==================== */}
        {activeTab === "identity" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <Type className="w-4 h-4 text-muted-foreground" /> Nom d'affichage
              </label>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Ex. Sarah Connor"
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-medium"
                value={formData.name || ""}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <AlignLeft className="w-4 h-4 text-muted-foreground" /> Message d'accueil (Hero Text)
              </label>
              <textarea
                ref={heroTextInputRef}
                placeholder="Ex. Bienvenue dans mon espace d'écriture..."
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-medium resize-none"
                value={formData.heroText || ""}
                onChange={e => setFormData(prev => ({ ...prev, heroText: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-muted-foreground" /> URL Image de Couverture (Banner)
              </label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/... (ou vide)"
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono text-xs"
                value={formData.headerImageUrl || ""}
                onChange={e => setFormData(prev => ({ ...prev, headerImageUrl: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Une image magnifique en haute-définition à afficher derrière le message d'accueil.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-muted-foreground" /> URL Image Logo / Avatar
              </label>
              <input
                type="text"
                placeholder="https://... (ou vide)"
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono text-xs"
                value={formData.logoUrl || ""}
                onChange={e => setFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                Texte de pied de page (Footer)
              </label>
              <input
                ref={footerTextInputRef}
                type="text"
                placeholder="Ex. Inscrivez-vous pour recevoir mes meilleures histoires..."
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-medium"
                value={formData.footerText || ""}
                onChange={e => setFormData(prev => ({ ...prev, footerText: e.target.value }))}
              />
            </div>
            
            <div className="pt-4 border-t border-border/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Référencement & SEO</h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">Titre SEO personnalisé</label>
                  <input
                    type="text"
                    placeholder="Sarah Connor | Articles et Réflexions"
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium"
                    value={formData.seoTitle || ""}
                    onChange={e => setFormData(prev => ({ ...prev, seoTitle: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">Description SEO personnalisée</label>
                  <textarea
                    placeholder="Découvrez mes pensées, analyses et actualités hebdomadaires..."
                    rows={2}
                    className="w-full px-4 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-medium resize-none"
                    value={formData.seoDescription || ""}
                    onChange={e => setFormData(prev => ({ ...prev, seoDescription: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Autoriser l'indexation Google</h4>
                    <p className="text-[10px] text-muted-foreground">Laissez les robots de recherche indexer votre profil.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary"
                    checked={formData.allowIndexing}
                    onChange={e => setFormData(prev => ({ ...prev, allowIndexing: e.target.checked }))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: THEMES & LAYOUTS ==================== */}
        {activeTab === "theme" && (
          <div className="space-y-6">
            {/* Theme Presets */}
            <div className="space-y-3">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <Paintbrush className="w-4 h-4 text-muted-foreground" /> Thèmes de couleur
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SITE_THEMES.map(theme => {
                  const isSelected = formData.themeMode === theme.id
                  return (
                    <button
                      key={theme.id}
                      onClick={() =>
                        setFormData(prev => ({
                          ...prev,
                          themeMode: theme.id,
                          accentColor: theme.accentColor
                        }))
                      }
                      className={`group relative text-left p-3.5 rounded-2xl border text-sm transition-all flex flex-col gap-2 cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md scale-[1.01]"
                          : "border-border hover:border-border-foreground bg-background hover:bg-muted/15"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold">{theme.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      
                      <div className="flex gap-1.5 py-1">
                        <span className="w-5 h-5 rounded-full border border-border/40 shadow-sm" style={{ backgroundColor: theme.bg }} title="Arrière-plan" />
                        <span className="w-5 h-5 rounded-full border border-border/40 shadow-sm" style={{ backgroundColor: theme.accentColor }} title="Accentuation" />
                        <span className="w-5 h-5 rounded-full border border-border/40 shadow-sm" style={{ backgroundColor: theme.fg }} title="Texte" />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">{theme.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Accent Color Picker */}
            <div className="space-y-2 p-4 border border-border/50 bg-muted/20 rounded-2xl">
              <label className="text-xs font-bold text-foreground block">Ajuster la couleur d'accentuation</label>
              <div className="flex items-center gap-3">
                <input
                  ref={accentColorRef}
                  type="color"
                  className="w-10 h-10 border-0 rounded-lg cursor-pointer bg-transparent"
                  value={formData.accentColor || currentThemePreset.accentColor}
                  onChange={e => setFormData(prev => ({ ...prev, accentColor: e.target.value }))}
                />
                <input
                  type="text"
                  placeholder="#EE4B2B"
                  className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-mono w-24 focus:outline-none"
                  value={formData.accentColor || currentThemePreset.accentColor}
                  onChange={e => setFormData(prev => ({ ...prev, accentColor: e.target.value }))}
                />
                <span className="text-[10px] text-muted-foreground">Une couleur unique pour boutons et liens.</span>
              </div>
            </div>

            {/* Layout Style Selector */}
            <div className="space-y-3">
              <label className="text-sm font-bold block">Style de Mise en Page (Layout)</label>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: "minimal", label: "Minimal", desc: "Design moderne et propre" },
                    { id: "magazine", label: "Magazine", desc: "Grille éditoriale élégante" },
                    { id: "brutalist", label: "Brutaliste", desc: "Contours gras & contrastes" }
                  ] as const
                ).map(layout => {
                  const isSelected = formData.layoutStyle === layout.id
                  return (
                    <button
                      key={layout.id}
                      onClick={() => setFormData(prev => ({ ...prev, layoutStyle: layout.id }))}
                      className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5 text-primary scale-[1.02]"
                          : "border-border hover:border-border-foreground bg-background text-foreground"
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wider">{layout.label}</span>
                      <p className="text-[9px] text-muted-foreground leading-tight hidden sm:block">{layout.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Typography Selector */}
            <div className="space-y-3">
              <label className="text-sm font-bold block">Style Typographique (Polices)</label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "sans", label: "Sans-Serif", stack: "SF Pro, Inter" },
                    { id: "serif", label: "Classical Serif", stack: "Playfair, Georgia" },
                    { id: "mono", label: "Technical Mono", stack: "SF Mono, Geist" }
                  ] as const
                ).map(font => {
                  const isSelected = formData.fontFamily === font.id
                  return (
                    <button
                      key={font.id}
                      onClick={() => setFormData(prev => ({ ...prev, fontFamily: font.id }))}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-border-foreground bg-background text-foreground"
                      }`}
                    >
                      <span className={`text-sm block font-bold ${
                        font.id === "serif" ? "font-serif" : font.id === "mono" ? "font-mono" : ""
                      }`}>Aa</span>
                      <span className="text-[10px] font-semibold block">{font.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: NAVIGATION & SOCIALS ==================== */}
        {activeTab === "navigation" && (
          <div className="space-y-6">
            {/* Navigation links */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4 text-primary" /> Liens de Navigation (En-tête)
                </label>
                <button
                  onClick={addNavigationLink}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline bg-primary/5 px-2 py-1 rounded-md"
                >
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>

              {formData.navigation.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-2xl bg-muted/10">
                  <p className="text-xs text-muted-foreground">Aucun lien personnalisé défini.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  <LayoutGroup id="nav-links">
                    {formData.navigation.map((link, idx) => (
                      <motion.div
                        layout
                        key={idx}
                        className="flex items-center gap-2 p-3 border rounded-xl bg-background shadow-xs hover:border-border-foreground transition-colors"
                      >
                        <div className="flex flex-col gap-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveNavigationLink(idx, "up")}
                            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            disabled={idx === formData.navigation.length - 1}
                            onClick={() => moveNavigationLink(idx, "down")}
                            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <input
                            type="text"
                            className="px-2 py-1 text-xs border rounded-md"
                            value={link.label}
                            placeholder="Nom"
                            onChange={e => {
                              const updated = [...formData.navigation]
                              updated[idx].label = e.target.value
                              setFormData(prev => ({ ...prev, navigation: updated }))
                            }}
                          />
                          <input
                            type="text"
                            className="px-2 py-1 text-xs border rounded-md font-mono"
                            value={link.url || ""}
                            placeholder="https://..."
                            onChange={e => {
                              const updated = [...formData.navigation]
                              updated[idx].url = e.target.value
                              setFormData(prev => ({ ...prev, navigation: updated }))
                            }}
                          />
                        </div>

                        <button
                          onClick={() => removeNavigationLink(idx)}
                          className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </LayoutGroup>
                </div>
              )}
            </div>

            {/* Social links */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold flex items-center gap-1.5">
                  📱 Réseaux Sociaux (Pied de page)
                </label>
                
                <div className="flex gap-1">
                  {(["twitter", "github", "instagram", "youtube"] as const).map(platform => (
                    <button
                      key={platform}
                      onClick={() => addSocialLink(platform)}
                      className="text-[10px] font-bold px-2 py-0.5 bg-muted rounded-md hover:bg-primary/10 hover:text-primary transition-colors capitalize"
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>

              {formData.socialLinks.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-2xl bg-muted/10">
                  <p className="text-xs text-muted-foreground">Aucun réseau social connecté.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {formData.socialLinks.map((social, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-3 border rounded-xl bg-background"
                    >
                      <span className="text-xs font-bold capitalize text-primary bg-primary/5 px-2 py-1 rounded-md w-16 text-center">
                        {social.platform}
                      </span>
                      <input
                        type="text"
                        className="px-2 py-1 text-xs border rounded-md flex-1 font-mono"
                        value={social.url}
                        onChange={e => {
                          const updated = [...formData.socialLinks]
                          updated[idx].url = e.target.value
                          setFormData(prev => ({ ...prev, socialLinks: updated }))
                        }}
                      />
                      <button
                        onClick={() => removeSocialLink(idx)}
                        className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monetization / Support link */}
            <div className="space-y-2 pt-4 border-t border-border/50">
              <label className="text-sm font-bold block">Support & Financement (Support URL)</label>
              <input
                type="text"
                placeholder="https://buymeacoffee.com/SarahConnor"
                className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono text-xs"
                value={formData.supportUrl || ""}
                onChange={e => setFormData(prev => ({ ...prev, supportUrl: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Lien vers votre plateforme de cagnotte ou adhésion (BuyMeACoffee, Patreon, etc.). Un bouton "Support Us" s'affichera dans l'en-tête de votre site.</p>
            </div>
          </div>
        )}

        {/* ==================== TAB: SUBDOMAIN ==================== */}
        {activeTab === "subdomain" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-primary" /> Sous-domaine créateur
              </label>
              
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="votre-nom"
                  className="px-4 py-2.5 rounded-l-xl border border-r-0 border-border/80 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-bold text-right flex-1 lowercase"
                  value={subdomainInput}
                  onChange={e => setSubdomainInput(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                />
                <span className="px-4 py-2.5 bg-muted text-muted-foreground border border-l-0 border-border/80 rounded-r-xl text-sm font-bold">
                  .qoe.fi
                </span>
              </div>

              {/* Validation Response Badges */}
              <AnimatePresence mode="wait">
                {subdomainCheckResult.loading && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-xs text-muted-foreground mt-2 px-1"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification de la disponibilité...
                  </motion.div>
                )}
                
                {!subdomainCheckResult.loading && subdomainCheckResult.available === true && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-xs text-emerald-500 font-bold mt-2 px-1 bg-emerald-500/5 border border-emerald-500/10 py-1.5 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Félicitations ! Ce sous-domaine est libre.
                  </motion.div>
                )}

                {!subdomainCheckResult.loading && subdomainCheckResult.available === false && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-xs text-destructive font-bold mt-2 px-1 bg-destructive/5 border border-destructive/10 py-1.5 rounded-lg"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> {subdomainCheckResult.error}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl mt-4">
                <h4 className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" /> Informations sur l'hébergement
                </h4>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Une fois enregistré, votre site sera instantanément accessible à l'adresse{" "}
                  <strong className="text-primary">{subdomainInput || "votre-nom"}.qoe.fi</strong>.
                  Toutes les publications faites sur ce dashboard apparaîtront automatiquement là-bas.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-border/50">
              <label className="text-sm font-bold block">Nom de Domaine Personnalisé (Custom Domain)</label>
              <input
                type="text"
                disabled
                placeholder="Ex. www.sarahconnor.com (Bientôt disponible)"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background/50 text-sm font-mono text-xs cursor-not-allowed opacity-60"
                value={formData.customDomain || ""}
              />
              <p className="text-[11px] text-muted-foreground">La configuration de votre propre nom de domaine est une fonctionnalité Premium de qoe.fi.</p>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          👉 RIGHT CANVAS: LIVE INTERACTIVE PREVIEW
          ===================================================================== */}
      <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 h-[calc(100vh-10rem)] sticky top-20 shadow-2xl overflow-hidden select-none">
        
        {/* Controls header for Canvas */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-900 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            <span className="text-[11px] font-mono font-bold text-zinc-500 ml-2">VISUAL EDITOR & PREVIEW</span>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
            <button
              onClick={() => setPreviewDevice("desktop")}
              className={`p-1.5 rounded-md transition-colors ${
                previewDevice === "desktop" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Aperçu Desktop"
            >
              <Laptop className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewDevice("mobile")}
              className={`p-1.5 rounded-md transition-colors ${
                previewDevice === "mobile" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Aperçu Mobile"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ==================== CANVAS WRAPPER (GRID INTERFACE) ==================== */}
        <div
          id="canvas-mockup-container"
          className="flex-1 w-full flex items-center justify-center relative overflow-auto rounded-2xl bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px]"
        >
          {/* ==================== FLOATING DYNAMIC TOOLBAR (Framer Motion) ==================== */}
          <AnimatePresence>
            {activeEditElement && toolbarCoordinates && (
              <motion.div
                data-no-dismiss
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 10 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                style={{
                  position: "absolute",
                  left: toolbarCoordinates.x,
                  top: toolbarCoordinates.y,
                  zIndex: 100
                }}
                className="flex items-center gap-1.5 bg-zinc-900/95 border border-zinc-700 p-1.5 rounded-xl shadow-2xl backdrop-blur-md"
              >
                <div className="flex items-center gap-1 px-1.5 py-0.5 border-r border-zinc-800">
                  <Sparkles className="w-3.5 h-3.5 text-primary text-amber-400" />
                  <span className="text-[10px] font-black uppercase text-zinc-400">Édition direct</span>
                </div>

                {activeEditElement === "heroText" && (
                  <>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, fontFamily: "sans" }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                        formData.fontFamily === "sans" ? "bg-primary text-white" : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      Sans
                    </button>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, fontFamily: "serif" }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                        formData.fontFamily === "serif" ? "bg-primary text-white" : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      Serif
                    </button>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, fontFamily: "mono" }))}
                      className={`px-2 py-1 text-[10px] font-bold rounded-md ${
                        formData.fontFamily === "mono" ? "bg-primary text-white" : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      Mono
                    </button>
                  </>
                )}

                {activeEditElement === "banner" && (
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, headerImageUrl: "" }))}
                    className="px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded-md flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Enlever la bannière
                  </button>
                )}

                {activeEditElement === "brand" && (
                  <button
                    onClick={() => {
                      const newName = prompt("Entrez le nouveau nom d'affichage :", formData.name || "")
                      if (newName !== null) setFormData(prev => ({ ...prev, name: newName }))
                    }}
                    className="px-2 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 rounded-md"
                  >
                    Changer le nom
                  </button>
                )}

                {activeEditElement === "supportUrl" && (
                  <button
                    onClick={() => {
                      const newUrl = prompt("Entrez l'URL de votre cagnotte (BuyMeACoffee/Patreon/etc.) :", formData.supportUrl || "")
                      if (newUrl !== null) setFormData(prev => ({ ...prev, supportUrl: newUrl }))
                    }}
                    className="px-2 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 rounded-md"
                  >
                    Éditer l'URL
                  </button>
                )}

                <button
                  onClick={() => {
                    setActiveEditElement(null)
                    setToolbarCoordinates(null)
                  }}
                  className="p-1 rounded-lg text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ==================== SITE PREVIEW MOCKUP CONTAINER ==================== */}
          <motion.div
            layout
            style={{
              width: previewDevice === "desktop" ? "100%" : "375px",
              height: previewDevice === "desktop" ? "100%" : "667px",
              maxHeight: "100%"
            }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className={`bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-y-auto transition-colors duration-300 relative ${
              previewDevice === "mobile" ? "rounded-[2rem] border-4 border-zinc-700/80" : "rounded-2xl"
            }`}
          >
            {/* Custom Styles Injection directly reflecting theme color presets */}
            <div
              style={{
                "--tenant-bg": currentThemePreset.bg,
                "--tenant-fg": currentThemePreset.fg,
                "--tenant-accent": formData.accentColor || currentThemePreset.accentColor,
                "--tenant-border": currentThemePreset.border,
                "--tenant-card": currentThemePreset.cardBg,
                "--tenant-secondary-bg": currentThemePreset.secondaryBg,
                "--tenant-muted": currentThemePreset.mutedText,
                fontFamily:
                  formData.fontFamily === "serif"
                    ? "Georgia, serif"
                    : formData.fontFamily === "mono"
                    ? "Courier New, monospace"
                    : "Inter, sans-serif"
              } as React.CSSProperties}
              className="min-h-full flex flex-col transition-colors duration-300"
            >
              {/* Actual Profile Page Mockup */}
              <div className="bg-[var(--tenant-bg)] text-[var(--tenant-fg)] min-h-full flex flex-col flex-1 pb-12">
                
                {/* ───────────────── HEADER AREA ───────────────── */}
                <header className={`border-b border-[var(--tenant-border)] bg-[var(--tenant-card)]/80 backdrop-blur-sm sticky top-0 z-30 transition-all ${
                  formData.layoutStyle === "brutalist" ? "border-b-4 border-[var(--tenant-fg)] py-5" : "py-4"
                }`}>
                  <div className="container mx-auto px-4 flex items-center justify-between">
                    
                    {/* Brand / Logo */}
                    <div
                      onClick={(e) => handlePreviewElementClick("brand", "identity", nameInputRef, e)}
                      className={`flex items-center gap-2 cursor-pointer edit-element group/brand relative p-1.5 rounded-lg border border-transparent hover:border-dashed hover:border-[var(--tenant-accent)] ${
                        activeEditElement === "brand" ? "border-dashed border-[var(--tenant-accent)] bg-[var(--tenant-accent)]/5" : ""
                      }`}
                    >
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-[var(--tenant-accent)]/20 flex items-center justify-center font-bold text-xs" style={{ color: "var(--tenant-accent)" }}>
                          Q
                        </div>
                      )}
                      <span className={`text-base font-black ${formData.layoutStyle === "brutalist" ? "uppercase" : ""}`}>
                        {formData.name || `${formData.subdomain || "votre-site"}.qoe.fi`}
                      </span>
                    </div>

                    {/* Navigation list */}
                    <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-[var(--tenant-muted)]">
                      {formData.navigation.slice(0, 4).map((link, i) => (
                        <span key={i} className="hover:text-[var(--tenant-fg)] transition-colors">
                          {link.label}
                        </span>
                      ))}
                      
                      <span
                        onClick={(e) => handlePreviewElementClick("navigation", "navigation", null as any, e)}
                        className="cursor-pointer font-bold text-[var(--tenant-accent)] flex items-center gap-0.5 hover:underline"
                        title="Éditer les liens"
                      >
                        Éditer <ChevronRight className="w-3 h-3" />
                      </span>
                    </nav>

                    {/* Support Us Button */}
                    {formData.supportUrl && (
                      <div
                        onClick={(e) => handlePreviewElementClick("supportUrl", "navigation", null as any, e)}
                        className={`cursor-pointer edit-element relative group/support hover:scale-102 transition-all`}
                      >
                        <span
                          className={`text-xs font-black text-white px-3.5 py-1.5 shadow-sm block ${
                            formData.layoutStyle === "brutalist"
                              ? "border-2 border-[var(--tenant-fg)] shadow-[2px_2px_0px_0px_var(--tenant-fg)] uppercase"
                              : "rounded-full"
                          }`}
                          style={{ backgroundColor: "var(--tenant-accent)" }}
                        >
                          Soutenir
                        </span>
                      </div>
                    )}
                  </div>
                </header>

                {/* ───────────────── HERO SECTION ───────────────── */}
                <section className="relative w-full overflow-hidden border-b border-[var(--tenant-border)]">
                  
                  {/* Custom Header banner image */}
                  <div
                    onClick={(e) => handlePreviewElementClick("banner", "identity", null as any, e)}
                    className={`relative w-full cursor-pointer edit-element group/banner ${
                      formData.headerImageUrl ? "h-48 md:h-56" : "h-12 border-b border-[var(--tenant-border)]/40 bg-[var(--tenant-secondary-bg)]"
                    } ${activeEditElement === "banner" ? "border-b-2 border-dashed border-[var(--tenant-accent)]" : ""}`}
                  >
                    {formData.headerImageUrl ? (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/70 mix-blend-multiply z-10" />
                        <img src={formData.headerImageUrl} alt="Header Cover" className="w-full h-full object-cover" />
                        <span className="absolute bottom-3 right-3 text-[10px] font-bold text-white/80 bg-black/60 px-2.5 py-1 rounded-md opacity-0 group-hover/banner:opacity-100 transition-opacity z-20">
                          Changer l'image
                        </span>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[var(--tenant-muted)]/50 group-hover/banner:text-[var(--tenant-accent)] transition-colors">
                        Aucune image de couverture • Cliquez pour en ajouter une
                      </div>
                    )}
                  </div>

                  {/* Main text message */}
                  <div className="container mx-auto px-4 py-16 md:py-20 text-center max-w-3xl">
                    <div
                      onClick={(e) => handlePreviewElementClick("heroText", "identity", heroTextInputRef, e)}
                      className={`p-4 rounded-2xl cursor-pointer border border-transparent hover:border-dashed hover:border-[var(--tenant-accent)] edit-element group/hero relative leading-tight ${
                        activeEditElement === "heroText" ? "border-dashed border-[var(--tenant-accent)] bg-[var(--tenant-accent)]/5" : ""
                      }`}
                    >
                      <h2 className={`tracking-tight ${
                        formData.layoutStyle === "brutalist"
                          ? "text-4xl md:text-5xl font-black uppercase"
                          : formData.layoutStyle === "magazine"
                          ? "text-4xl md:text-5xl font-serif font-extrabold"
                          : "text-3xl md:text-4xl font-extrabold"
                      }`}>
                        {formData.heroText || `Bienvenue sur le site de ${formData.name || "mon profil"}`}
                      </h2>
                      
                      <span className="absolute top-2 right-2 text-[9px] font-bold text-[var(--tenant-accent)] bg-[var(--tenant-accent)]/10 px-2 py-0.5 rounded-md opacity-0 group-hover/hero:opacity-100 transition-opacity">
                        Double-clic pour éditer
                      </span>
                    </div>
                  </div>
                </section>

                {/* ───────────────── LIST OF PUBLICATIONS (MOCKUP) ───────────────── */}
                <main className="container mx-auto px-4 py-12 max-w-4xl flex-1">
                  <div className="flex items-center justify-between mb-8 border-b border-[var(--tenant-border)] pb-3">
                    <h3 className={`text-base font-bold uppercase tracking-wider ${formData.layoutStyle === "brutalist" ? "font-black" : ""}`}>
                      Publications Récentes
                    </h3>
                    <span className="text-xs text-[var(--tenant-muted)] font-bold">2 articles</span>
                  </div>

                  {/* Fake articles lists representing active Layout Styles */}
                  <div className={`grid gap-6 ${
                    formData.layoutStyle === "magazine" ? "grid-cols-1 md:grid-cols-12" : "grid-cols-1 md:grid-cols-2"
                  }`}>
                    {/* Mock article 1 */}
                    <div className={`flex flex-col p-5 bg-[var(--tenant-card)] border border-[var(--tenant-border)] transition-all ${
                      formData.layoutStyle === "brutalist"
                        ? "border-4 border-[var(--tenant-fg)] shadow-[4px_4px_0px_0px_var(--tenant-fg)]"
                        : "rounded-2xl"
                    } ${
                      formData.layoutStyle === "magazine" ? "md:col-span-12" : ""
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--tenant-accent)] mb-2 block">17 JUIN 2026 • TECH</span>
                      <h4 className={`text-lg font-bold mb-2 ${formData.layoutStyle === "brutalist" ? "uppercase font-black" : ""}`}>
                        L'art de sculpter des interfaces web de niveau art
                      </h4>
                      <p className="text-xs text-[var(--tenant-muted)] leading-relaxed">
                        Exploration des micro-interactions élégantes inspirées de Rauno, de la gestion des spring physics, des animations fluides et de la conception de dashboards créateur uniques...
                      </p>
                    </div>

                    {/* Mock article 2 */}
                    <div className={`flex flex-col p-5 bg-[var(--tenant-card)] border border-[var(--tenant-border)] transition-all ${
                      formData.layoutStyle === "brutalist"
                        ? "border-4 border-[var(--tenant-fg)] shadow-[4px_4px_0px_0px_var(--tenant-fg)]"
                        : "rounded-2xl"
                    } ${
                      formData.layoutStyle === "magazine" ? "md:col-span-12" : ""
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--tenant-accent)] mb-2 block">14 JUIN 2026 • DESIGN</span>
                      <h4 className={`text-lg font-bold mb-2 ${formData.layoutStyle === "brutalist" ? "uppercase font-black" : ""}`}>
                        Pourquoi les aesthetics d'une plateforme de créateur déterminent son succès
                      </h4>
                      <p className="text-xs text-[var(--tenant-muted)] leading-relaxed">
                        Une analyse de l'expérience utilisateur et de l'intégration bidirectionnelle entre l'IA générative et les systèmes de design complexes de demain...
                      </p>
                    </div>
                  </div>
                </main>

                {/* ───────────────── FOOTER ───────────────── */}
                <footer className={`border-t border-[var(--tenant-border)] bg-[var(--tenant-secondary-bg)] py-12 px-4 text-center mt-auto ${
                  formData.layoutStyle === "brutalist" ? "border-t-4 border-[var(--tenant-fg)]" : ""
                }`}>
                  <div className="max-w-md mx-auto space-y-5">
                    <h3 className="text-lg font-black tracking-tight">Rejoignez le cercle privé</h3>
                    <p className="text-xs text-[var(--tenant-muted)] leading-normal">
                      {formData.footerText || "Inscrivez-vous pour recevoir les dernières publications de mon esprit directement dans votre boîte mail."}
                    </p>
                    
                    {/* Mock newsletter input */}
                    <div className="flex gap-2 max-w-sm mx-auto">
                      <input
                        type="text"
                        disabled
                        placeholder="votre.email@adresse.com"
                        className={`px-3 py-2 text-xs border bg-[var(--tenant-card)] border-[var(--tenant-border)] flex-1 text-[var(--tenant-muted)] ${
                          formData.layoutStyle === "brutalist" ? "border-2 border-[var(--tenant-fg)] font-mono" : "rounded-xl"
                        }`}
                      />
                      <button
                        disabled
                        className={`text-xs font-bold text-white px-4 py-2 ${
                          formData.layoutStyle === "brutalist" ? "border-2 border-[var(--tenant-fg)] shadow-[2px_2px_0px_0px_var(--tenant-fg)] uppercase" : "rounded-xl"
                        }`}
                        style={{ backgroundColor: "var(--tenant-accent)" }}
                      >
                        S'abonner
                      </button>
                    </div>

                    {/* Social Handles Icons preview */}
                    {formData.socialLinks.length > 0 && (
                      <div className="flex justify-center gap-4 text-[var(--tenant-muted)] pt-6">
                        {formData.socialLinks.map((social, i) => (
                          <span key={i} className="text-xs font-bold uppercase tracking-wider hover:text-[var(--tenant-accent)] transition-colors">
                            {social.platform}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <p className="text-[10px] text-[var(--tenant-muted)]/60 pt-6">
                      © {new Date().getFullYear()} {formData.name || "Mon site"}. Propulsé par qoe.fi
                    </p>
                  </div>
                </footer>

              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* =====================================================================
          💾 FLOATING ACTIONS BAR (SAVE DOCK) - Framer Motion
          ===================================================================== */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-6 px-6 py-4 bg-zinc-900/90 border border-zinc-800 text-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-md w-[90%] max-w-2xl"
          >
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <div>
                <p className="text-xs font-bold">Modifications non enregistrées</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Enregistrez pour appliquer ces paramètres sur votre site live.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={isPending}
                onClick={handleDiscardChanges}
                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700/60 rounded-xl transition-all cursor-pointer"
              >
                Annuler
              </button>
              
              <button
                disabled={isPending}
                onClick={handleSaveAll}
                className="flex items-center gap-2 px-5 py-2 text-xs font-black text-white bg-primary hover:bg-primary/90 hover:scale-102 active:scale-98 rounded-xl shadow-md transition-all cursor-pointer"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Enregistrer
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
