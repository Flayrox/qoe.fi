// =====================================================================
// ⚡ QOE Creator Studio Component — apps/dashboard/src/features/settings/components/creator-studio.tsx
// =====================================================================
// Custom ultra-premium visual site builder & writing environment.
// Fully interactive, fully animated, supports dual-state tracking.
// =====================================================================

"use client"

import React, { useState, useEffect, useRef, useTransition } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { useTheme } from "next-themes"
import { useDebounce } from "use-debounce"
import { toast } from "sonner"
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
  ChevronRight,
  ChevronLeft,
  FileText,
  Layout,
  Eye,
  Undo,
  Tag,
  Hash,
  ChevronDown,
  Star,
  CheckCircle,
  User,
  Settings
} from "lucide-react"

// Import Server Actions
import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction,
  createStudioArticleAction,
  updateStudioArticleAction,
  deleteStudioArticleAction
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

export const SITE_FONTS = [
  { id: "sans", name: "Inter", family: "'Inter', sans-serif" },
  { id: "outfit", name: "Outfit", family: "'Outfit', sans-serif" },
  { id: "space-grotesk", name: "Space Grotesk", family: "'Space Grotesk', sans-serif" },
  { id: "serif", name: "Playfair Display", family: "'Playfair Display', serif" },
]

interface CreatorStudioProps {
  initialCreator: CreatorProfile
}

type ActiveView = "accueil" | "domaine" | "article"
type ActiveSection = "brand" | "hero" | "publications" | "footer" | "global"
type RightSidebarTab = "global" | "identity" | "header" | "footer"

export default function CreatorStudio({ initialCreator }: CreatorStudioProps) {
  const { theme: dashboardTheme } = useTheme()

  // =====================================================================
  // 💾 STATE MANAGEMENT (DUAL-STATE BASELINE TRACKING)
  // =====================================================================
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator)
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator)

  const [activeView, setActiveView] = useState<ActiveView>("accueil")
  const [activeSection, setActiveSection] = useState<ActiveSection>("brand")
  const [rightTab, setRightSidebarTab] = useState<RightSidebarTab>("identity")
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null)

  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop")
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingArticle, setIsCreatingArticle] = useState(false)
  const [isDeletingArticle, setIsDeletingArticle] = useState(false)

  // Subdomain Validation State
  const [subdomainInput, setSubdomainInput] = useState(current.subdomain || "")
  const [debouncedSubdomain] = useDebounce(subdomainInput, 400)
  const [subdomainCheck, setSubdomainCheck] = useState<{
    loading: boolean
    available: boolean | null
    error: string | null
  }>({ loading: false, available: null, error: null })

  // Refs for smooth focus
  const nameInputRef = useRef<HTMLInputElement>(null)
  const heroInputRef = useRef<HTMLTextAreaElement>(null)
  const footerInputRef = useRef<HTMLTextAreaElement>(null)
  const accentColorRef = useRef<HTMLInputElement>(null)

  // Sync subdomain input with changes
  useEffect(() => {
    setSubdomainInput(current.subdomain || "")
  }, [current.subdomain])

  // Subdomain availability effect
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

  // Get active article
  const activeArticle = current.articles.find(a => a.id === activeArticleId)

  // Determine active font stack
  const activeFont = SITE_FONTS.find(f => f.id === current.fontFamily) || SITE_FONTS[0]
  const currentThemePreset = SITE_THEMES.find(t => t.id === current.themeMode) || SITE_THEMES[0]

  // Compare states for floats
  const hasChanges = JSON.stringify(current) !== JSON.stringify(original)

  // =====================================================================
  // ⚙️ MUTATIONS / ACTIONS HANDLERS
  // =====================================================================

  const handleDiscardChanges = () => {
    setCurrent(original)
    toast.info("Toutes les modifications non enregistrées ont été annulées.")
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    try {
      // 1. Save Profile Fields if changed
      const profileFieldsChanged = [
        "name", "heroText", "accentColor", "fontFamily", "themeMode", "layoutStyle",
        "logoUrl", "headerImageUrl", "footerText", "seoTitle", "seoDescription",
        "allowIndexing", "supportUrl"
      ].some(field => current[field as keyof CreatorProfile] !== original[field as keyof CreatorProfile])

      if (profileFieldsChanged) {
        await updateCreatorProfileAction({
          name: current.name,
          heroText: current.heroText,
          accentColor: current.accentColor,
          fontFamily: current.fontFamily,
          themeMode: current.themeMode,
          layoutStyle: current.layoutStyle,
          logoUrl: current.logoUrl,
          headerImageUrl: current.headerImageUrl,
          footerText: current.footerText,
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          allowIndexing: current.allowIndexing,
          supportUrl: current.supportUrl
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

      // 5. Save Articles if changed
      for (const curArt of current.articles) {
        const origArt = original.articles.find(a => a.id === curArt.id)
        if (!origArt || JSON.stringify(curArt) !== JSON.stringify(origArt)) {
          await updateStudioArticleAction(curArt.id, {
            title: curArt.title,
            content: curArt.content || "",
            slug: curArt.slug,
            categoryId: curArt.categoryId,
            published: curArt.published,
            isPremium: curArt.isPremium,
            seoTitle: curArt.seoTitle,
            seoDescription: curArt.seoDescription
          })
        }
      }

      toast.success("Studio sauvegardé et mis en ligne avec succès !")
      setOriginal(current)
    } catch (err: any) {
      toast.error(err.message || "Erreur de sauvegarde.")
    } finally {
      setIsSaving(false)
    }
  }

  // Articles CRUD inside Studio
  const handleCreateArticle = async () => {
    setIsCreatingArticle(true)
    try {
      const newArt = await createStudioArticleAction()
      const mappedArticle: StudioArticle = {
        id: newArt.id,
        title: newArt.title,
        slug: newArt.slug,
        content: newArt.content,
        published: newArt.published,
        isPremium: newArt.isPremium,
        categoryId: newArt.categoryId,
        seoTitle: newArt.seoTitle,
        seoDescription: newArt.seoDescription,
        createdAt: newArt.createdAt.toISOString()
      }

      setOriginal(prev => ({ ...prev, articles: [mappedArticle, ...prev.articles] }))
      setCurrent(prev => ({ ...prev, articles: [mappedArticle, ...prev.articles] }))
      setActiveArticleId(newArt.id)
      setActiveView("article")
      toast.success("Nouveau brouillon d'article créé !")
    } catch (err: any) {
      toast.error("Erreur d'initialisation de l'article : " + err.message)
    } finally {
      setIsCreatingArticle(false)
    }
  }

  const handleDeleteArticle = async () => {
    if (!activeArticleId) return
    if (!window.confirm("Voulez-vous vraiment supprimer définitivement cet article ?")) return

    setIsDeletingArticle(true)
    try {
      await deleteStudioArticleAction(activeArticleId)
      setOriginal(prev => ({ ...prev, articles: prev.articles.filter(a => a.id !== activeArticleId) }))
      setCurrent(prev => ({ ...prev, articles: prev.articles.filter(a => a.id !== activeArticleId) }))
      setActiveArticleId(null)
      setActiveView("accueil")
      toast.success("Article supprimé avec succès.")
    } catch (err: any) {
      toast.error("Erreur de suppression : " + err.message)
    } finally {
      setIsDeletingArticle(false)
    }
  }

  const updateActiveArticleField = (field: keyof StudioArticle, value: any) => {
    if (!activeArticleId) return
    setCurrent(prev => {
      const updated = prev.articles.map(art => {
        if (art.id === activeArticleId) {
          return { ...art, [field]: value }
        }
        return art
      })
      return { ...prev, articles: updated }
    })
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

  // =====================================================================
  // 🖱️ DIRECT PREVIEW INTERCEPTORS
  // =====================================================================
  const focusInInspector = (section: ActiveSection, tab: RightSidebarTab, ref?: React.RefObject<any>) => {
    setActiveView("accueil")
    setActiveArticleId(null)
    setActiveSection(section)
    setRightSidebarTab(tab)

    if (ref && ref.current) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "center" })
        ref.current?.focus()
      }, 100)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] w-full overflow-hidden bg-background text-foreground relative font-sans">
      {/* Dynamic Font Loader */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Outfit:wght@400;500;600;700;900&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap" />

      {/* =====================================================================
          👉 LEFT SIDEBAR (280px): NOTION-LIKE STRUCTURAL DOCUMENT TREE
          ===================================================================== */}
      <div className="w-[280px] shrink-0 border-r border-border h-full overflow-y-auto flex flex-col bg-card select-none">
        
        {/* Profile Branding Header */}
        <div className="p-4 border-b border-border/60 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm">
            QS
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight uppercase">QOE Studio</h2>
            <p className="text-[10px] text-muted-foreground font-semibold">Visual Architect v4.1</p>
          </div>
        </div>

        {/* 1. Vues Section */}
        <div className="p-4 border-b border-border/40">
          <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-2.5">Vues</h4>
          <div className="space-y-1">
            <button
              onClick={() => { setActiveView("accueil"); setActiveArticleId(null); setRightSidebarTab("identity"); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === "accueil"
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlignLeft className="w-3.5 h-3.5" />
                <span>Accueil du Site</span>
              </div>
              <Eye className="w-3.5 h-3.5 opacity-60" />
            </button>
            
            <button
              onClick={() => { setActiveView("domaine"); setActiveArticleId(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeView === "domaine"
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" />
                <span>Domaine & URL</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        </div>

        {/* 2. Articles List Section */}
        <div className="p-4 border-b border-border/40 flex-1 flex flex-col min-h-[180px]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Articles</h4>
            <button
              onClick={handleCreateArticle}
              disabled={isCreatingArticle}
              className="flex items-center gap-1 text-[10px] font-extrabold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50"
            >
              {isCreatingArticle ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Plus className="w-2.5 h-2.5" />
              )}
              <span>Nouveau</span>
            </button>
          </div>
          
          <div className="space-y-1 overflow-y-auto flex-1 max-h-52 pr-1">
            {current.articles.map(art => {
              const isSelected = activeArticleId === art.id;
              return (
                <button
                  key={art.id}
                  onClick={() => {
                    setActiveArticleId(art.id);
                    setActiveView("article");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 text-primary border border-primary/20 font-bold"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{art.title || "Sans Titre"}</span>
                  </div>
                  <span className={`text-[8px] font-black px-1 py-0.2 rounded shrink-0 ml-1.5 uppercase ${
                    art.published
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {art.published ? "Pub" : "Draft"}
                  </span>
                </button>
              );
            })}
            
            {current.articles.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 border border-dashed border-border rounded-xl">
                Aucun article pour le moment.
              </div>
            )}
          </div>
        </div>

        {/* 3. Catégories Section */}
        <div className="p-4 border-b border-border/40">
          <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-2.5">Catégories</h4>
          <div className="flex flex-wrap gap-1.5">
            {current.categories.map(cat => (
              <span key={cat.id} className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">
                <Tag className="w-2.5 h-2.5 text-primary" />
                {cat.name}
              </span>
            ))}
            {current.categories.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic">Aucune catégorie définie.</span>
            )}
          </div>
        </div>

        {/* 4. Homepage Structure Section (Only active when viewing Homepage) */}
        {activeView === "accueil" && (
          <div className="p-4">
            <h4 className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mb-2.5">Structure Page</h4>
            <div className="space-y-1">
              {(
                [
                  { id: "brand", label: "En-tête (Logo / Navigation)", icon: Layout, tab: "header" },
                  { id: "hero", label: "Message d'accueil (Hero)", icon: AlignLeft, tab: "identity" },
                  { id: "publications", label: "Grille des Publications", icon: FileText, tab: "global" },
                  { id: "footer", label: "Pied de page (Newsletter & Sociaux)", icon: Layout, tab: "footer" },
                ] as const
              ).map(sec => {
                const isFocused = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => {
                      setActiveSection(sec.id);
                      setRightSidebarTab(sec.tab);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-left transition-all cursor-pointer ${
                      isFocused
                        ? "bg-zinc-150 dark:bg-zinc-800 text-foreground border border-neutral-200 dark:border-zinc-700 shadow-xs"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <sec.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          👉 CENTER WORKSPACE: DOT-MATRIX INFINITE GRID WITH DEVICE CHASSIS
          ===================================================================== */}
      <div className="flex-1 h-full overflow-hidden flex flex-col bg-muted/25 relative">
        
        {/* Device Switch & Address Bar Top Panel */}
        <div className="w-full h-11 border-b border-border bg-card/60 backdrop-blur-md px-4 flex items-center justify-between z-10 select-none">
          <div className="flex items-center gap-1 bg-neutral-200/60 dark:bg-zinc-800 p-0.5 rounded-lg border border-border/80">
            <button
              onClick={() => setPreviewDevice("desktop")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                previewDevice === "desktop" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Aperçu Ordinateur"
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice("mobile")}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                previewDevice === "mobile" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Aperçu Mobile"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Premium Browser Mockup Address Bar */}
          <div className="flex-1 max-w-md mx-6 flex items-center gap-1.5 px-3 py-1 rounded-md bg-neutral-100 dark:bg-zinc-900 border border-border text-[11px] font-mono text-muted-foreground">
            <span className="text-emerald-500 font-extrabold select-none">https://</span>
            <span className="font-bold text-foreground">{current.subdomain || "votre-site"}</span>
            <span className="font-semibold text-muted-foreground">.qoe.fi</span>
            {activeView === "article" && activeArticle && (
              <span className="text-muted-foreground/60 truncate">/articles/{activeArticle.slug || "sans-titre"}</span>
            )}
          </div>

          <div className="w-24 flex items-center justify-end gap-1.5">
            <span className="text-[10px] font-black tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded uppercase">
              {previewDevice}
            </span>
          </div>
        </div>

        {/* Dot-matrix Grid Canvas */}
        <div className="flex-1 w-full flex items-center justify-center p-6 overflow-auto bg-[radial-gradient(rgba(238,75,43,0.08)_1px,transparent_1px)] [background-size:20px_24px]">
          
          {/* Spring physics chassis */}
          <motion.div
            layout
            style={{
              width: previewDevice === "desktop" ? "100%" : "390px",
              height: previewDevice === "desktop" ? "100%" : "780px",
              maxWidth: "100%",
              maxHeight: "100%"
            }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className={`bg-zinc-900 border border-border shadow-2xl flex flex-col overflow-hidden relative ${
              previewDevice === "mobile" ? "rounded-[3rem] border-8 border-zinc-700 dark:border-zinc-800" : "rounded-xl"
            }`}
          >
            {/* Dynamic CSS styles injection depending on color/font configs */}
            <div
              style={{
                "--tenant-bg": currentThemePreset.bg,
                "--tenant-fg": currentThemePreset.fg,
                "--tenant-accent": current.accentColor || currentThemePreset.accentColor,
                "--tenant-border": currentThemePreset.border,
                "--tenant-card": currentThemePreset.cardBg,
                "--tenant-secondary-bg": currentThemePreset.secondaryBg,
                "--tenant-muted": currentThemePreset.mutedText,
                fontFamily: activeFont.family
              } as React.CSSProperties}
              className="w-full h-full overflow-y-auto flex flex-col bg-[var(--tenant-bg)] text-[var(--tenant-fg)] transition-colors duration-300 select-text"
            >

              {/* VIEW: HOME VIEW MOCKUP */}
              {activeView === "accueil" && (
                <div className="min-h-full flex flex-col flex-1 pb-16">
                  
                  {/* Header Component */}
                  <header
                    onClick={() => focusInInspector("brand", "header")}
                    className={`border-b border-[var(--tenant-border)] bg-[var(--tenant-card)]/90 sticky top-0 z-30 transition-all cursor-pointer group ${
                      current.layoutStyle === "brutalist" ? "border-b-4 border-[var(--tenant-fg)] py-5" : "py-4"
                    } ${activeSection === "brand" ? "ring-2 ring-[#EE4B2B]/40 bg-[#EE4B2B]/5" : "hover:bg-neutral-500/5"}`}
                  >
                    <div className="container mx-auto px-4 flex items-center justify-between">
                      
                      {/* Logo / Brand editable block */}
                      <div className="flex items-center gap-2">
                        {current.logoUrl ? (
                          <img src={current.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[var(--tenant-accent)]/15 flex items-center justify-center font-black text-xs" style={{ color: "var(--tenant-accent)" }}>
                            {current.name?.charAt(0) || "Q"}
                          </div>
                        )}
                        
                        <input
                          value={current.name || ""}
                          onChange={e => setCurrent(prev => ({ ...prev, name: e.target.value }))}
                          onClick={e => { e.stopPropagation(); focusInInspector("brand", "identity", nameInputRef); }}
                          className="bg-transparent border-none outline-none focus:ring-1 focus:ring-[#EE4B2B]/40 hover:bg-neutral-500/10 px-2 py-0.5 rounded text-sm font-black transition-all max-w-[130px]"
                          style={{ color: "var(--tenant-fg)" }}
                          placeholder="Nom créateur"
                        />
                      </div>

                      {/* Header Custom links list */}
                      <nav className="hidden md:flex items-center gap-4 text-xs font-semibold text-[var(--tenant-muted)]">
                        {current.navigation.slice(0, 4).map((link, idx) => (
                          <span key={idx} className="hover:text-[var(--tenant-fg)] transition-colors">
                            {link.label}
                          </span>
                        ))}
                        {current.navigation.length === 0 && (
                          <span className="text-[10px] italic text-[var(--tenant-muted)]/50">Aucun lien</span>
                        )}
                      </nav>

                      {/* Support Trigger Button */}
                      {current.supportUrl ? (
                        <span
                          className={`text-[10px] font-black text-white px-3 py-1.5 shadow-xs block ${
                            current.layoutStyle === "brutalist"
                              ? "border-2 border-[var(--tenant-fg)] shadow-[2px_2px_0px_0px_var(--tenant-fg)] uppercase"
                              : "rounded-full"
                          }`}
                          style={{ backgroundColor: "var(--tenant-accent)" }}
                        >
                          Soutenir
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[var(--tenant-muted)] group-hover:text-[#EE4B2B] hover:underline">
                          + Activer bouton support
                        </span>
                      )}
                    </div>
                  </header>

                  {/* Banner / Hero Section */}
                  <section
                    onClick={() => focusInInspector("hero", "identity")}
                    className={`relative w-full overflow-hidden border-b border-[var(--tenant-border)] transition-all cursor-pointer group ${
                      activeSection === "hero" ? "ring-2 ring-[#EE4B2B]/40 bg-[#EE4B2B]/5" : "hover:bg-neutral-500/5"
                    }`}
                  >
                    {/* Header Banner Cover Image */}
                    <div className={`relative w-full ${current.headerImageUrl ? "h-40 md:h-52" : "h-14 bg-[var(--tenant-secondary-bg)] flex items-center justify-center"}`}>
                      {current.headerImageUrl ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60 mix-blend-multiply z-10" />
                          <img src={current.headerImageUrl} alt="Bannière" className="w-full h-full object-cover" />
                        </>
                      ) : (
                        <span className="text-[11px] font-bold text-[var(--tenant-muted)]/40 group-hover:text-[#EE4B2B] transition-colors">
                          Saisir URL Bannière
                        </span>
                      )}
                    </div>

                    {/* Editable display Name Message */}
                    <div className="container mx-auto px-4 py-12 md:py-16 text-center max-w-2xl">
                      <textarea
                        value={current.heroText || ""}
                        onChange={e => {
                          setCurrent(prev => ({ ...prev, heroText: e.target.value }))
                          e.target.style.height = "auto"
                          e.target.style.height = e.target.scrollHeight + "px"
                        }}
                        onClick={e => { e.stopPropagation(); focusInInspector("hero", "identity", heroInputRef); }}
                        className={`bg-transparent border-none outline-none focus:ring-1 focus:ring-[#EE4B2B]/40 hover:bg-neutral-500/10 px-4 py-2 text-center w-full resize-none font-bold transition-all leading-tight ${
                          current.layoutStyle === "brutalist"
                            ? "text-3xl font-black uppercase"
                            : current.layoutStyle === "magazine"
                            ? "text-3xl font-serif font-extrabold"
                            : "text-2xl font-bold"
                        }`}
                        style={{ height: "auto", color: "var(--tenant-fg)" }}
                        rows={2}
                        placeholder="Message de bienvenue..."
                      />
                    </div>
                  </section>

                  {/* Feed mockups */}
                  <main
                    onClick={() => focusInInspector("publications", "global")}
                    className={`container mx-auto px-4 py-10 max-w-3xl flex-1 cursor-pointer transition-all ${
                      activeSection === "publications" ? "ring-2 ring-[#EE4B2B]/40 bg-[#EE4B2B]/5" : "hover:bg-neutral-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-6 border-b border-[var(--tenant-border)] pb-2">
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${current.layoutStyle === "brutalist" ? "font-black" : ""}`}>
                        Publications Récentes
                      </h3>
                      <span className="text-[11px] text-[var(--tenant-muted)] font-bold">Aperçu en direct</span>
                    </div>

                    {/* Articles representation cards */}
                    <div className={`grid gap-4 ${current.layoutStyle === "magazine" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                      {current.articles.slice(0, 2).map((art, i) => (
                        <div
                          key={art.id || i}
                          className={`flex flex-col p-4 bg-[var(--tenant-card)] border border-[var(--tenant-border)] transition-all ${
                            current.layoutStyle === "brutalist"
                              ? "border-3 border-[var(--tenant-fg)] shadow-[3px_3px_0px_0px_var(--tenant-fg)]"
                              : "rounded-xl"
                          }`}
                        >
                          <span className="text-[9px] font-black uppercase tracking-wider text-[var(--tenant-accent)] mb-1">
                            {current.categories.find(c => c.id === art.categoryId)?.name || "GÉNÉRAL"}
                          </span>
                          <h4 className={`text-sm font-bold mb-1 line-clamp-1 ${current.layoutStyle === "brutalist" ? "uppercase font-black" : ""}`}>
                            {art.title || "Titre d'article"}
                          </h4>
                          <p className="text-[11px] text-[var(--tenant-muted)] line-clamp-2 leading-relaxed">
                            {art.content || "Aucun contenu écrit pour le moment..."}
                          </p>
                        </div>
                      ))}
                      {current.articles.length === 0 && (
                        <div className="col-span-full text-center py-8 text-xs text-[var(--tenant-muted)] font-bold">
                          Aucun article encore rédigé. Cliquez sur [+ Nouveau] à gauche pour commencer !
                        </div>
                      )}
                    </div>
                  </main>

                  {/* Footer Mock */}
                  <footer
                    onClick={() => focusInInspector("footer", "footer")}
                    className={`border-t border-[var(--tenant-border)] bg-[var(--tenant-secondary-bg)] py-10 px-4 text-center mt-auto cursor-pointer transition-all ${
                      activeSection === "footer" ? "ring-2 ring-[#EE4B2B]/40 bg-[#EE4B2B]/5" : "hover:bg-neutral-500/5"
                    }`}
                  >
                    <div className="max-w-sm mx-auto space-y-4">
                      
                      {/* Interactive Footer Text */}
                      <textarea
                        value={current.footerText || ""}
                        onChange={e => {
                          setCurrent(prev => ({ ...prev, footerText: e.target.value }))
                          e.target.style.height = "auto"
                          e.target.style.height = e.target.scrollHeight + "px"
                        }}
                        onClick={e => { e.stopPropagation(); focusInInspector("footer", "footer", footerInputRef); }}
                        className="bg-transparent border-none outline-none focus:ring-1 focus:ring-[#EE4B2B]/40 hover:bg-neutral-500/10 px-3 py-1.5 text-center w-full resize-none text-xs transition-all leading-normal"
                        style={{ height: "auto", color: "var(--tenant-muted)" }}
                        rows={1}
                        placeholder="Message du pied de page..."
                      />

                      {/* Social handles list preview */}
                      {current.socialLinks.length > 0 && (
                        <div className="flex justify-center flex-wrap gap-3 pt-2">
                          {current.socialLinks.map((soc, idx) => (
                            <span key={idx} className="text-[10px] font-black uppercase text-[var(--tenant-muted)] hover:text-[var(--tenant-accent)] transition-colors">
                              {soc.platform}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-[9px] text-[var(--tenant-muted)]/50 pt-3">
                        © {new Date().getFullYear()} • Propulsé par qoe.fi
                      </p>
                    </div>
                  </footer>

                </div>
              )}

              {/* VIEW: ARTICLE WRITING VIEW */}
              {activeView === "article" && activeArticle && (
                <div className="min-h-full flex flex-col flex-1 pb-16">
                  
                  {/* Top Editor Bar */}
                  <div className="container mx-auto px-4 py-3 border-b border-[var(--tenant-border)] flex items-center justify-between sticky top-0 bg-[var(--tenant-bg)]/95 backdrop-blur-md z-20">
                    <button
                      onClick={() => { setActiveView("accueil"); setActiveArticleId(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--tenant-secondary-bg)] border border-[var(--tenant-border)] text-[11px] text-[var(--tenant-muted)] hover:text-[var(--tenant-fg)] font-bold transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Accueil</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        activeArticle.published
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                      }`}>
                        {activeArticle.published ? "Publié" : "Brouillon"}
                      </span>
                    </div>
                  </div>

                  {/* Editorial Writing Page */}
                  <main className="container mx-auto px-6 py-12 max-w-2xl flex-1 flex flex-col">
                    
                    {/* Meta tags */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--tenant-accent)]">
                        {current.categories.find(c => c.id === activeArticle.categoryId)?.name || "Général"}
                      </span>
                      {activeArticle.isPremium && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wide bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          ★ Premium
                        </span>
                      )}
                    </div>

                    {/* Article Title Field */}
                    <textarea
                      value={activeArticle.title || ""}
                      onChange={e => {
                        const title = e.target.value
                        updateActiveArticleField("title", title)
                      }}
                      className="bg-transparent border-none outline-none focus:ring-0 w-full text-3xl md:text-4xl font-extrabold tracking-tight resize-none text-[var(--tenant-fg)] leading-snug mb-6"
                      placeholder="Titre de votre article..."
                      rows={1}
                    />

                    {/* Article Editorial Writing Body */}
                    <textarea
                      value={activeArticle.content || ""}
                      onChange={e => {
                        const content = e.target.value
                        updateActiveArticleField("content", content)
                      }}
                      className="bg-transparent border-none outline-none focus:ring-0 w-full flex-1 min-h-[350px] text-sm md:text-base leading-relaxed resize-none text-[var(--tenant-fg)]"
                      placeholder="Commencez à rédiger votre histoire ici..."
                    />

                  </main>

                </div>
              )}

              {/* VIEW: DOMAINE VIEW PANEL FALLBACK AT CENTER IF DIRECT SELECTION */}
              {activeView === "domaine" && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-[#EE4B2B]/10 border border-[#EE4B2B]/20 flex items-center justify-center mb-4">
                    <Globe className="w-6 h-6 text-[#EE4B2B]" />
                  </div>
                  <h3 className="text-base font-black tracking-tight uppercase">Configuration Domaine</h3>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Saisissez et validez la disponibilité de votre sous-domaine unique dans le panneau de droite. Une fois validé, il sera actif sur le web immédiatement.
                  </p>
                </div>
              )}

            </div>
          </motion.div>

        </div>
      </div>

      {/* =====================================================================
          👉 RIGHT SIDEBAR (340px): CONTEXTUAL PROPERTY INSPECTOR
          ===================================================================== */}
      <div className="w-[340px] shrink-0 border-l border-border h-full overflow-y-auto flex flex-col bg-card select-none">
        
        {/* DOMAIN VIEW INSPECTOR PANEL */}
        {activeView === "domaine" && (
          <div className="p-5 space-y-6">
            <div className="pb-3 border-b border-border/60">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-primary text-[#EE4B2B]" />
                <span>Adresse & Domaine</span>
              </h3>
              <p className="text-[10px] text-muted-foreground mt-1">Configurez le point d'accès public de votre site.</p>
            </div>

            {/* Subdomain inputs */}
            <div className="space-y-2">
              <label className="text-xs font-bold block">Sous-domaine qoe.fi</label>
              <div className="flex items-center">
                <input
                  type="text"
                  placeholder="votre-nom"
                  value={subdomainInput}
                  onChange={e => setSubdomainInput(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  className="px-3 py-2.5 rounded-l-lg border border-r-0 border-border bg-background text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#EE4B2B] lowercase flex-1"
                />
                <span className="px-3 py-2.5 bg-muted text-muted-foreground border border-l-0 border-border rounded-r-lg text-xs font-black">
                  .qoe.fi
                </span>
              </div>

              {/* Status Indicator Badges */}
              <AnimatePresence mode="wait">
                {subdomainCheck.loading && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-1.5 font-medium"
                  >
                    <Loader2 className="w-3 h-3 animate-spin text-[#EE4B2B]" />
                    <span>Recherche de disponibilité...</span>
                  </motion.div>
                )}

                {!subdomainCheck.loading && subdomainCheck.available === true && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1 text-[10px] text-emerald-500 font-extrabold mt-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-md"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Adresse disponible !</span>
                  </motion.div>
                )}

                {!subdomainCheck.loading && subdomainCheck.available === false && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1 text-[10px] text-destructive font-extrabold mt-1.5 bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 rounded-md"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{subdomainCheck.error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="p-4 bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 rounded-xl space-y-1.5">
              <h4 className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                <span>Hébergement Cloud</span>
              </h4>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Votre site visualisé est automatiquement hébergé sur nos serveurs CDN. En sauvegardant, il sera déployé à l'adresse indiquée.
              </p>
            </div>

            <button
              onClick={() => setCurrent(prev => ({ ...prev, subdomain: subdomainInput }))}
              disabled={subdomainInput === original.subdomain || subdomainCheck.available !== true}
              className="w-full py-2 bg-[#EE4B2B] hover:bg-[#EE4B2B]/90 text-white font-black text-xs rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Appliquer le sous-domaine
            </button>
          </div>
        )}

        {/* ARTICLE EDIT VIEW INSPECTOR PANEL */}
        {activeView === "article" && activeArticle && (
          <div className="p-5 space-y-6">
            <div className="pb-3 border-b border-border/60">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary text-[#EE4B2B]" />
                <span>Éditeur de Publication</span>
              </h3>
              <p className="text-[10px] text-muted-foreground mt-1">Paramètres de publication et référencement.</p>
            </div>

            {/* Custom Slug input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold block">Adresse de l'article (Slug)</label>
              <div className="flex items-center">
                <span className="px-2 py-2 bg-muted text-muted-foreground border border-r-0 border-border rounded-l-lg text-[10px] font-mono">
                  /articles/
                </span>
                <input
                  type="text"
                  value={activeArticle.slug || ""}
                  onChange={e => {
                    const cleanSlug = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
                    updateActiveArticleField("slug", cleanSlug)
                  }}
                  className="px-3 py-2 border border-border bg-background text-xs font-semibold focus:outline-none rounded-r-lg flex-1 lowercase font-mono"
                  placeholder="permalink-article"
                />
              </div>
            </div>

            {/* Category Selector Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold block">Catégorie</label>
              <div className="relative">
                <select
                  value={activeArticle.categoryId || ""}
                  onChange={e => updateActiveArticleField("categoryId", e.target.value || null)}
                  className="w-full px-3 py-2 border border-border bg-background rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#EE4B2B] appearance-none"
                >
                  <option value="">Général / Non classifié</option>
                  {current.categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Premium Content Switch */}
            <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl">
              <div>
                <h4 className="text-xs font-bold flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Contenu Premium</span>
                </h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">Réservé uniquement aux abonnés.</p>
              </div>
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#EE4B2B] cursor-pointer"
                checked={activeArticle.isPremium}
                onChange={e => updateActiveArticleField("isPremium", e.target.checked)}
              />
            </div>

            {/* Published status Switch */}
            <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl">
              <div>
                <h4 className="text-xs font-bold">Rendre l'article public</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">L'article sera en ligne immédiatement.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                  activeArticle.published
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-zinc-500/10 text-zinc-400"
                }`}>
                  {activeArticle.published ? "Publié" : "Brouillon"}
                </span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#EE4B2B] cursor-pointer"
                  checked={activeArticle.published}
                  onChange={e => updateActiveArticleField("published", e.target.checked)}
                />
              </div>
            </div>

            {/* SEO Specific Subform */}
            <div className="pt-4 border-t border-border/40 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">SEO Article</h4>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Titre de l'onglet</label>
                <input
                  type="text"
                  value={activeArticle.seoTitle || ""}
                  onChange={e => updateActiveArticleField("seoTitle", e.target.value)}
                  placeholder="Laisser vide pour utiliser le titre standard"
                  className="w-full px-3 py-1.5 border border-border rounded-lg text-xs bg-background font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground">Méta Description</label>
                <textarea
                  value={activeArticle.seoDescription || ""}
                  onChange={e => updateActiveArticleField("seoDescription", e.target.value)}
                  placeholder="Court résumé attractif pour Google..."
                  rows={2}
                  className="w-full px-3 py-1.5 border border-border rounded-lg text-xs bg-background font-medium resize-none"
                />
              </div>
            </div>

            {/* Delete button action */}
            <div className="pt-4 border-t border-border/40">
              <button
                onClick={handleDeleteArticle}
                disabled={isDeletingArticle}
                className="w-full py-2 bg-destructive/15 hover:bg-destructive/20 text-destructive font-bold text-xs rounded-lg border border-destructive/20 flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeletingArticle ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Supprimer le brouillon</span>
              </button>
            </div>
          </div>
        )}

        {/* ACCUEIL VIEW INSPECTOR PANEL */}
        {activeView === "accueil" && (
          <div className="flex flex-col h-full overflow-hidden">
            
            {/* Category tabs inside inspector */}
            <div className="grid grid-cols-4 gap-0.5 p-1 bg-muted/60 border-b border-border">
              {(
                [
                  { id: "identity", label: "Profil", icon: AlignLeft },
                  { id: "global", label: "Global", icon: Paintbrush },
                  { id: "header", label: "Entête", icon: LinkIcon },
                  { id: "footer", label: "Footer", icon: Globe }
                ] as const
              ).map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setRightSidebarTab(tab.id)}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                      rightTab === tab.id
                        ? "bg-card text-foreground border border-border/80 shadow-xs"
                        : "text-muted-foreground hover:bg-card/30"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 mb-1" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Inspector Inner Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* TAB 1: IDENTITY */}
              {rightTab === "identity" && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-border/40">
                    <h3 className="text-xs font-black uppercase tracking-wider">Identité Créateur</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Paramètres d'accroche et profil principal.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Nom d'affichage</label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={current.name || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex. Sarah Connor"
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-bold focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Message de bienvenue (Hero)</label>
                    <textarea
                      ref={heroInputRef}
                      value={current.heroText || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, heroText: e.target.value }))}
                      placeholder="Ex. Bienvenue dans mon espace d'écriture..."
                      rows={3}
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-semibold focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Lien Image Logo (Avatar)</label>
                    <input
                      type="text"
                      value={current.logoUrl || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, logoUrl: e.target.value }))}
                      placeholder="https://... URL"
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-medium font-mono text-[10px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Lien Image Bannière</label>
                    <input
                      type="text"
                      value={current.headerImageUrl || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, headerImageUrl: e.target.value }))}
                      placeholder="https://images.unsplash.com/... cover image"
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-medium font-mono text-[10px]"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: GLOBAL GLOBAL PANEL */}
              {rightTab === "global" && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-border/40">
                    <h3 className="text-xs font-black uppercase tracking-wider">Thème & Style Global</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Changer l'apparence instantanément.</p>
                  </div>

                  {/* Themes Grid */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold block">Palette de Couleurs</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SITE_THEMES.map(theme => {
                        const isSelected = current.themeMode === theme.id
                        return (
                          <button
                            key={theme.id}
                            onClick={() =>
                              setCurrent(prev => ({
                                ...prev,
                                themeMode: theme.id,
                                accentColor: theme.accentColor
                              }))
                            }
                            className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 cursor-pointer transition-all ${
                              isSelected
                                ? "border-[#EE4B2B] bg-[#EE4B2B]/5 shadow-xs"
                                : "border-border bg-background hover:bg-muted/15"
                            }`}
                          >
                            <span className="text-[10px] font-extrabold truncate">{theme.name}</span>
                            <div className="flex gap-1">
                              <span className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: theme.bg }} />
                              <span className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: theme.accentColor }} />
                              <span className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: theme.fg }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Font Cards */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold block">Famille de Polices</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SITE_FONTS.map(font => {
                        const isSelected = current.fontFamily === font.id
                        return (
                          <button
                            key={font.id}
                            onClick={() => setCurrent(prev => ({ ...prev, fontFamily: font.id }))}
                            className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 cursor-pointer transition-all ${
                              isSelected
                                ? "border-[#EE4B2B] bg-[#EE4B2B]/5"
                                : "border-border bg-background hover:bg-muted/15"
                            }`}
                          >
                            <span className="text-[11px] font-black" style={{ fontFamily: font.family }}>Aa</span>
                            <span className="text-[9px] font-bold text-muted-foreground leading-none">{font.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Layout selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold block">Style Structurel (Layout)</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: "minimal", label: "Minimal" },
                          { id: "magazine", label: "Magazine" },
                          { id: "brutalist", label: "Brutaliste" }
                        ] as const
                      ).map(lay => {
                        const isSelected = current.layoutStyle === lay.id
                        return (
                          <button
                            key={lay.id}
                            onClick={() => setCurrent(prev => ({ ...prev, layoutStyle: lay.id }))}
                            className={`py-2 rounded-lg border text-[10px] font-extrabold cursor-pointer transition-all ${
                              isSelected
                                ? "border-[#EE4B2B] bg-[#EE4B2B]/5 text-[#EE4B2B]"
                                : "border-border bg-background hover:bg-muted/15"
                            }`}
                          >
                            {lay.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom Accent color picker */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Couleur d'accentuation</label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={accentColorRef}
                        type="color"
                        value={current.accentColor || currentThemePreset.accentColor}
                        onChange={e => setCurrent(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={current.accentColor || currentThemePreset.accentColor}
                        onChange={e => setCurrent(prev => ({ ...prev, accentColor: e.target.value }))}
                        placeholder="#EE4B2B"
                        className="px-2 py-1.5 border border-border rounded bg-background text-xs font-mono font-bold w-20 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Support Button URL */}
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <label className="text-xs font-bold block">Lien du Bouton "Soutenir" (Support URL)</label>
                    <input
                      type="text"
                      value={current.supportUrl || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, supportUrl: e.target.value }))}
                      placeholder="https://buymeacoffee.com/SarahConnor"
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-mono text-[10px]"
                    />
                    <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                      Optionnel. Permet d'injecter un bouton de financement participatif (BuyMeACoffee, Patreon) dans votre en-tête.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 3: HEADER PANEL (NAVIGATION BUILDER) */}
              {rightTab === "header" && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-border/40 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider">Liens de Navigation</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Gérer les onglets de l'en-tête.</p>
                    </div>
                    <button
                      onClick={addNavigationLink}
                      className="flex items-center gap-1 text-[10px] font-extrabold text-[#EE4B2B] hover:underline bg-[#EE4B2B]/5 border border-[#EE4B2B]/10 px-2 py-1 rounded-md cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Ajouter</span>
                    </button>
                  </div>

                  {current.navigation.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 border border-dashed rounded-xl">
                      Aucun lien personnalisé dans le menu.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      <LayoutGroup id="right-nav-items">
                        {current.navigation.map((nav, idx) => (
                          <motion.div
                            layout
                            key={idx}
                            className="flex items-center gap-2 p-2 border border-border bg-background rounded-xl shadow-xs relative"
                          >
                            <div className="flex flex-col gap-0.5">
                              <button
                                disabled={idx === 0}
                                onClick={() => reorderNavigationLink(idx, "up")}
                                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                disabled={idx === current.navigation.length - 1}
                                onClick={() => reorderNavigationLink(idx, "down")}
                                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1 flex-1">
                              <input
                                type="text"
                                value={nav.label}
                                onChange={e => {
                                  const updated = [...current.navigation]
                                  updated[idx] = { ...updated[idx], label: e.target.value }
                                  setCurrent(prev => ({ ...prev, navigation: updated }))
                                }}
                                className="px-1.5 py-1 text-[10px] border border-border rounded bg-background font-semibold focus:outline-none"
                                placeholder="Intitulé"
                              />
                              <input
                                type="text"
                                value={nav.url || ""}
                                onChange={e => {
                                  const updated = [...current.navigation]
                                  updated[idx] = { ...updated[idx], url: e.target.value }
                                  setCurrent(prev => ({ ...prev, navigation: updated }))
                                }}
                                className="px-1.5 py-1 text-[10px] border border-border rounded bg-background font-mono text-[9px] focus:outline-none"
                                placeholder="https://"
                              />
                            </div>

                            <button
                              onClick={() => removeNavigationLink(idx)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </LayoutGroup>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: FOOTER & SOCIALS PANEL */}
              {rightTab === "footer" && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-border/40">
                    <h3 className="text-xs font-black uppercase tracking-wider">Footer & Réseaux Sociaux</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Personnaliser la signature du site.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold block">Texte de Pied de page</label>
                    <textarea
                      ref={footerInputRef}
                      value={current.footerText || ""}
                      onChange={e => setCurrent(prev => ({ ...prev, footerText: e.target.value }))}
                      placeholder="Inscrivez-vous pour recevoir mes dernières publications..."
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-background font-semibold focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-2 pt-3 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold">Réseaux Connectés</label>
                      <div className="flex gap-1">
                        {(["twitter", "github", "instagram", "youtube"] as const).map(plat => (
                          <button
                            key={plat}
                            onClick={() => addSocialLink(plat)}
                            className="text-[9px] font-black uppercase px-1.5 py-0.5 bg-muted hover:bg-[#EE4B2B]/10 hover:text-[#EE4B2B] transition-colors rounded cursor-pointer"
                          >
                            +{plat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {current.socialLinks.length === 0 ? (
                      <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 border border-dashed rounded-xl">
                        Aucune plateforme sociale connectée.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {current.socialLinks.map((soc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 border border-border bg-background rounded-xl shadow-xs"
                          >
                            <span className="text-[9px] font-black capitalize text-[#EE4B2B] bg-[#EE4B2B]/5 px-2 py-1 rounded w-16 text-center select-none shrink-0 border border-[#EE4B2B]/10">
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
                              className="px-1.5 py-1 text-[10px] border border-border bg-background rounded flex-1 font-mono text-[9px] focus:outline-none"
                            />

                            <button
                              onClick={() => removeSocialLink(idx)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* =====================================================================
          💾 FLOATING SAVE DOCK (Animated Framer-Motion Command-Pill)
          ===================================================================== */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 80, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 80, x: "-50%" }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-6 left-1/2 z-50 flex items-center justify-between gap-6 px-5 py-3.5 bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-800 text-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md w-[90%] max-w-xl select-none"
          >
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider">Modifications en cours</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">Enregistrez pour synchroniser votre site.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={isSaving}
                onClick={handleDiscardChanges}
                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all cursor-pointer"
              >
                Annuler
              </button>
              
              <button
                disabled={isSaving}
                onClick={handleSaveAll}
                className="flex items-center gap-2 px-5 py-2 text-xs font-black text-white bg-[#EE4B2B] hover:bg-[#EE4B2B]/90 hover:scale-[1.02] active:scale-[0.98] rounded-xl shadow-md transition-all cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sauvegarde...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
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
