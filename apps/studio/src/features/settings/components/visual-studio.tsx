// =====================================================================
// ⚡ QOE Creator Publication Settings — apps/studio/src/features/settings/components/visual-studio.tsx
// =====================================================================
// Pure, Minimalist Creator Settings Console (Ghost CMS & Vercel Settings Style).
// 100% Theme-Agnostic Semantic Tokens (@qoe/theme). Zero AI Slop.
// =====================================================================

'use client';

import React, { useState, useEffect } from 'react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import { toast } from '@qoe/ui/toast';
import { URLS } from '@qoe/config';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  ExternalLink,
  Plus,
  Trash2,
  Check,
  Loader2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Mail,
  Search,
  Globe,
  Compass,
  Info,
} from 'lucide-react';

// Import Server Actions
import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction,
} from '@qoe/sdk/actions/dashboard';

import { EmailTemplates } from './email-templates';
import { PublicationLivePreview } from './publication-live-preview';
import { SeoPreview } from './seo-preview';

// =====================================================================
// 🎨 TYPES & DATA DEFINITIONS
// =====================================================================

export interface ClientNavigationItem {
  id?: string;
  label: string;
  url: string | null;
  order: number;
  isExternal: boolean;
}

export interface ClientSocialLink {
  id?: string;
  platform: string;
  url: string;
  order: number;
}

export interface StudioArticle {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  published: boolean;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt: string;
}

export interface ClientCategory {
  id: string;
  name: string;
  slug: string;
}

export interface CreatorProfile {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  themeMode: string | null;
  layoutStyle: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  footerText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  allowIndexing: boolean;
  supportUrl: string | null;
  subdomain: string | null;
  customDomain: string | null;
  navigation: ClientNavigationItem[];
  socialLinks: ClientSocialLink[];
  articles: StudioArticle[];
  categories: ClientCategory[];
  advancedSettingsMode: boolean;
  /** Contexte média (lorsque le workspace actif est un Média) */
  isMedia?: boolean;
  mediaRole?: string;
}

export const ACCENT_SWATCHES = [
  { id: 'vermilion', name: 'Vermillon', hex: '#EE4B2B' },
  { id: 'emerald', name: 'Émeraude', hex: '#10B981' },
  { id: 'royal', name: 'Bleu Royal', hex: '#3B82F6' },
  { id: 'orchid', name: 'Orchidée', hex: '#D946EF' },
  { id: 'amber', name: 'Ambre', hex: '#F59E0B' },
  { id: 'charcoal', name: 'Anthracite', hex: '#3F3F46' },
];

export const SITE_FONTS = [
  { id: 'sans', name: 'Inter (Sans-serif)', family: "'Inter', sans-serif" },
  { id: 'outfit', name: 'Outfit (Moderne)', family: "'Outfit', sans-serif" },
  { id: 'space-grotesk', name: 'Space Grotesk (Tech)', family: "'Space Grotesk', sans-serif" },
  { id: 'serif', name: 'Playfair Display (Serif)', family: "'Playfair Display', serif" },
];

export const SUPPORTED_SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X (Twitter)' },
  { id: 'github', name: 'GitHub' },
  { id: 'substack', name: 'Substack' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'bluesky', name: 'Bluesky' },
  { id: 'mastodon', name: 'Mastodon' },
  { id: 'threads', name: 'Threads' },
];

interface VisualStudioProps {
  initialCreator: CreatorProfile;
  /** ID de la publication active — requis pour les réglages email (Go API). */
  publicationId?: string;
}

type TabType = 'general' | 'emails' | 'domain' | 'navigation' | 'seo';

export default function VisualStudio({ initialCreator, publicationId }: VisualStudioProps) {
  // =====================================================================
  // 💾 STATE MANAGEMENT
  // =====================================================================
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator);
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator);
  const isMediaWorkspace = initialCreator.isMedia ?? false;
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ecoute des events depuis le CmdK
  useEffect(() => {
    const handleHashChange = (hashToUse?: string) => {
      const hash = hashToUse || window.location.hash;
      if (!hash) return;

      const tabMatch = hash.match(/^#(general|emails|domain|navigation|seo)/);
      if (tabMatch) {
        setActiveTab(tabMatch[1] as TabType);
      }

      // On scroll jusqu'à l'ancre spécifique (ex: #name)
      setTimeout(() => {
        const el = document.getElementById(hash.substring(1));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-muted/50', 'transition-colors', 'duration-500');
          setTimeout(() => el.classList.remove('bg-muted/50'), 2000);
        }
      }, 300);
    };

    const handleCustomNavigate = (e: Event) => {
      handleHashChange('#' + (e as CustomEvent<{ hash: string }>).detail.hash);
    };

    window.addEventListener('hashchange', () => handleHashChange());
    window.addEventListener('cmdKNavigate', handleCustomNavigate);

    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', () => handleHashChange());
      window.removeEventListener('cmdKNavigate', handleCustomNavigate);
    };
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Subdomain Validation State
  const [subdomainInput, setSubdomainInput] = useState(current.subdomain || '');
  const [debouncedSubdomain] = useDebounce(subdomainInput, 400);
  const [subdomainCheck, setSubdomainCheck] = useState<{
    loading: boolean;
    available: boolean | null;
    error: string | null;
  }>({ loading: false, available: null, error: null });

  useEffect(() => {
    setSubdomainInput(current.subdomain || '');
  }, [current.subdomain]);

  useEffect(() => {
    if (debouncedSubdomain === original.subdomain) {
      setSubdomainCheck({ loading: false, available: null, error: null });
      return;
    }
    if (!debouncedSubdomain) {
      setSubdomainCheck({
        loading: false,
        available: false,
        error: t`Le sous-domaine ne peut pas être vide.`,
      });
      return;
    }

    async function check() {
      setSubdomainCheck({ loading: true, available: null, error: null });
      try {
        const res = await checkSubdomainAvailabilityAction(debouncedSubdomain);
        setSubdomainCheck({
          loading: false,
          available: res.ok ? res.data.available : false,
          error: res.ok
            ? res.data.reason || null
            : res.error?.message || 'Sous-domaine indisponible.',
        });
      } catch {
        setSubdomainCheck({
          loading: false,
          available: false,
          error: t`Erreur de vérification.`,
        });
      }
    }
    check();
  }, [debouncedSubdomain, original.subdomain]);

  const hasChanges = JSON.stringify(current) !== JSON.stringify(original);

  const getPublicBlogUrl = () => {
    if (typeof window === 'undefined')
      return `http://${current.subdomain || 'climat'}.lvh.me:15403`;
    const host = window.location.hostname;
    const activeSub = current.subdomain || 'climat';
    const isCaddy = !window.location.port;
    if (host.includes('lvh.me')) {
      return `http://${activeSub}.lvh.me${isCaddy ? '' : ':15403'}`;
    }
    if (host.includes('qoe.test')) {
      return `http://${activeSub}.qoe.test`;
    }
    if (host.includes('localhost')) {
      return `http://${activeSub}.lvh.me:15403`;
    }
    return `https://${activeSub}.qoe.fi`;
  };

  const publicBlogUrl = getPublicBlogUrl();
  const consoleSettingsUrl = isMounted ? `${URLS.CONSOLE}/settings` : '#';

  // =====================================================================
  // ⚙️ MUTATION HANDLERS
  // =====================================================================

  const handleDiscardChanges = () => {
    setCurrent(original);
    toast.info(t`Modifications annulées.`);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const profileFieldsChanged = [
        'name',
        'heroText',
        'accentColor',
        'fontFamily',
        'logoUrl',
        'headerImageUrl',
        'footerText',
        'seoTitle',
        'seoDescription',
        'allowIndexing',
        'supportUrl',
      ].some(
        (field) =>
          current[field as keyof CreatorProfile] !== original[field as keyof CreatorProfile]
      );

      if (profileFieldsChanged) {
        await updateCreatorProfileAction({
          name: current.name,
          heroText: current.heroText,
          accentColor: current.accentColor,
          fontFamily: current.fontFamily,
          logoUrl: current.logoUrl,
          headerImageUrl: current.headerImageUrl,
          footerText: current.footerText,
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          allowIndexing: current.allowIndexing,
          supportUrl: current.supportUrl,
        });
      }

      if (current.subdomain !== original.subdomain) {
        if (current.subdomain) {
          if (subdomainCheck.available === false) {
            throw new Error(`Sous-domaine invalide : ${subdomainCheck.error}`);
          }
          await updateSubdomainAction(current.subdomain);
        } else {
          await updateSubdomainAction('');
        }
      }

      const navChanged = JSON.stringify(current.navigation) !== JSON.stringify(original.navigation);
      if (navChanged) {
        await saveNavigationLinksAction(current.navigation);
      }

      const socialChanged =
        JSON.stringify(current.socialLinks) !== JSON.stringify(original.socialLinks);
      if (socialChanged) {
        await saveSocialLinksAction(current.socialLinks);
      }

      toast.success(t`Paramètres enregistrés.`);
      setOriginal(current);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut: ⌘S / Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !isSaving) {
          handleSaveAll();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, isSaving, current]);

  // Navigation Links Helpers
  const addNavigationLink = () => {
    const newLink: ClientNavigationItem = {
      label: 'Nouvel onglet',
      url: 'https://',
      order: current.navigation.length,
      isExternal: true,
    };
    setCurrent((prev) => ({ ...prev, navigation: [...prev.navigation, newLink] }));
  };

  const removeNavigationLink = (idx: number) => {
    setCurrent((prev) => {
      const filtered = prev.navigation.filter((_, i) => i !== idx);
      return { ...prev, navigation: filtered.map((item, i) => ({ ...item, order: i })) };
    });
  };

  const reorderNavigationLink = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === current.navigation.length - 1) return;

    setCurrent((prev) => {
      const items = [...prev.navigation];
      const target = direction === 'up' ? idx - 1 : idx + 1;
      const temp = items[idx];
      items[idx] = items[target];
      items[target] = temp;
      return { ...prev, navigation: items.map((item, i) => ({ ...item, order: i })) };
    });
  };

  // Social Links Helpers
  const addSocialLink = (platform: string) => {
    if (current.socialLinks.some((s) => s.platform === platform)) {
      toast.warning(`Le profil ${platform} est déjà présent.`);
      return;
    }
    const newSocial: ClientSocialLink = {
      platform,
      url: `https://${platform}.com/`,
      order: current.socialLinks.length,
    };
    setCurrent((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, newSocial] }));
  };

  const removeSocialLink = (idx: number) => {
    setCurrent((prev) => {
      const filtered = prev.socialLinks.filter((_, i) => i !== idx);
      return { ...prev, socialLinks: filtered.map((item, i) => ({ ...item, order: i })) };
    });
  };

  const TABS = [
    { id: 'general' as const, label: t`Identité & Design`, icon: Sparkles },
    { id: 'emails' as const, label: t`Emails & Abonnés`, icon: Mail },
    { id: 'seo' as const, label: t`SEO & Réseaux`, icon: Search },
    { id: 'domain' as const, label: t`Domaine & DNS`, icon: Globe },
    { id: 'navigation' as const, label: t`Navigation & Liens`, icon: Compass },
  ];

  return (
    <div className="w-full min-h-screen bg-background text-foreground font-sans pb-28">
      {/* =====================================================================
          TOP HEADER (Ghost / Vercel Settings Header — Wide & Clean)
          ===================================================================== */}
      <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {current.name || 'Paramètres de la publication'}
              </h1>
              {isMediaWorkspace && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                  Média
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isMediaWorkspace
                ? `Configuration du média « ${current.name} » et de son identité publique`
                : t`Configuration et design de votre publication souveraine`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={publicBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <span>Voir le site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              disabled={!hasChanges || isSaving}
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
            >
              {isSaving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Enregistrement...</span>
                </span>
              ) : (
                <span>Enregistrer</span>
              )}
            </button>
          </div>
        </div>

        {/* Minimal Tab Bar */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-2 sm:gap-6 border-b border-border/40 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 pt-1 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? 'border-primary text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'opacity-70'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN SETTINGS STAGE (Wide Max-W-6XL Canvas)
          ===================================================================== */}
      <main className="max-w-6xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {/* TAB 1: IDENTITÉ & DESIGN (AVEC LIVE PREVIEW IMMERSIF) */}
          {activeTab === 'general' && (
            <motion.div
              key="tab-general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Colonne de gauche : Formulaires de configuration */}
              <div className="lg:col-span-7 space-y-6">
                {/* Notice d'isolation : Publication vs Compte personnel */}
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground shadow-2xs">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold text-foreground block">
                      Identité éditoriale souveraine (Tenant)
                    </span>
                    <p>
                      Ce nom, ce slogan et ces éléments graphiques définissent uniquement
                      l'apparence de votre publication sur{' '}
                      <strong className="text-foreground">
                        {current.subdomain ? `${current.subdomain}.qoe.fi` : 'votre site'}
                      </strong>
                      . Ils sont strictement séparés de votre biographie personnelle et de votre
                      compte lecteur.
                    </p>
                  </div>
                </div>

                {/* Card 1: Identité Textuelle */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Identité de la publication
                  </h3>

                  {/* Title */}
                  <div id="name" className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      Nom de la publication
                    </label>
                    <input
                      type="text"
                      value={current.name || ''}
                      onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex. Le Carnet de Sarah"
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Titre principal affiché dans l'en-tête de votre site et dans les flux de
                      lecture.
                    </span>
                  </div>

                  {/* Slogan éditorial */}
                  <div id="hero" className="space-y-1.5 pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground block">
                        Slogan éditorial (Hero Tagline)
                      </label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {current.heroText?.length || 0}/180 car.
                      </span>
                    </div>
                    <textarea
                      value={current.heroText || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, heroText: e.target.value }))
                      }
                      maxLength={240}
                      placeholder={t`Ex. Réflexions sur la technologie, l'art et l'écriture libre...`}
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Sous-titre concis décrivant votre ligne éditoriale (affiché sur le header du
                      site).
                    </span>
                  </div>
                </div>

                {/* Card 2: Direction Artistique (Typographie & Couleurs) */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Direction artistique & Style
                  </h3>

                  {/* Visual Font Cards */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground block">
                      Police éditoriale
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {SITE_FONTS.map((font) => {
                        const isSelected = (current.fontFamily || 'sans') === font.id;
                        return (
                          <button
                            key={font.id}
                            type="button"
                            onClick={() => setCurrent((prev) => ({ ...prev, fontFamily: font.id }))}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                                : 'border-border/40 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                {font.name}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <p
                              style={{ fontFamily: font.family }}
                              className="text-sm text-foreground/90 font-medium truncate"
                            >
                              L'art d'écrire en toute liberté.
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accent Color Swatches */}
                  <div id="brand" className="space-y-2.5 pt-2 border-t border-border/30">
                    <label className="text-xs font-semibold text-foreground block">
                      Couleur d'accentuation
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                      {ACCENT_SWATCHES.map((swatch) => {
                        const isSelected =
                          current.accentColor?.toLowerCase() === swatch.hex.toLowerCase();
                        return (
                          <button
                            key={swatch.id}
                            type="button"
                            onClick={() =>
                              setCurrent((prev) => ({ ...prev, accentColor: swatch.hex }))
                            }
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary shadow-xs'
                                : 'border-border/40 bg-muted/20 hover:bg-muted/50 text-muted-foreground'
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                              style={{ backgroundColor: swatch.hex }}
                            />
                            <span>{swatch.name}</span>
                          </button>
                        );
                      })}

                      {/* Custom Color Input */}
                      <div className="flex items-center gap-1.5 pl-1">
                        <input
                          type="color"
                          value={current.accentColor || '#EE4B2B'}
                          onChange={(e) =>
                            setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                          }
                          className="w-7 h-7 rounded border border-border/40 cursor-pointer bg-transparent shrink-0"
                          title="Couleur personnalisée"
                        />
                        <input
                          type="text"
                          value={current.accentColor || '#EE4B2B'}
                          onChange={(e) =>
                            setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                          }
                          className="w-24 px-2 py-1.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-mono font-medium text-foreground focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Médias & Marque (Logo & Couverture) */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Médias & Identité visuelle
                  </h3>

                  {/* Avatar / Logo */}
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-foreground block">
                        Avatar / Logo du média
                      </label>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Symbole rond affiché en en-tête et dans les favoris (512x512px recommandé).
                      </span>
                    </div>
                    <div className="max-w-[140px]">
                      <ImageUploader
                        value={current.logoUrl}
                        onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                        upload={(file) =>
                          uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                        }
                        aspect={1}
                        shape="circle"
                        maxDimension={512}
                      />
                    </div>
                  </div>

                  {/* Cover Image */}
                  <div className="space-y-2 pt-3 border-t border-border/30">
                    <div>
                      <label className="text-xs font-semibold text-foreground block">
                        Image de couverture (Bannière d'en-tête)
                      </label>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Bannière panoramique ratio 21:9 affichée en haut de votre publication.
                      </span>
                    </div>
                    <ImageUploader
                      value={current.headerImageUrl}
                      onChange={(url) => setCurrent((prev) => ({ ...prev, headerImageUrl: url }))}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
                      }
                      aspect={21 / 9}
                      shape="banner"
                    />
                  </div>
                </div>
              </div>

              {/* Colonne de droite : Aperçu en direct du site (Sticky) */}
              <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                <PublicationLivePreview
                  name={current.name}
                  heroText={current.heroText}
                  accentColor={current.accentColor}
                  fontFamily={current.fontFamily}
                  logoUrl={current.logoUrl}
                  headerImageUrl={current.headerImageUrl}
                  subdomain={current.subdomain}
                  navigation={current.navigation}
                />

                <div className="p-4 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground flex items-center justify-between gap-3">
                  <span>Besoin de modifier votre mot de passe ou email ?</span>
                  <a
                    href={consoleSettingsUrl}
                    className="shrink-0 px-2.5 py-1 bg-background hover:bg-muted border border-border/60 rounded-lg font-semibold text-foreground text-[11px] transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <span>Mon Compte</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: EMAILS (AVEC NOUVELLE VUE ÉLARGIE ET SÉLECTEUR MOBILE/DESKTOP) */}
          {activeTab === 'emails' && (
            <motion.div
              key="tab-emails"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {publicationId ? (
                <EmailTemplates publicationId={publicationId} />
              ) : (
                <div className="py-16 text-center text-xs text-muted-foreground">
                  {t`Réglages email indisponibles pour ce workspace.`}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: SEO & RÉSEAUX (AVEC SIMULATEUR SERP & SOCIAL CARD) */}
          {activeTab === 'seo' && (
            <motion.div
              key="tab-seo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Formulaire SEO */}
              <div className="lg:col-span-7 space-y-6">
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Référencement & Métadonnées
                  </h3>

                  {/* Meta Title */}
                  <div id="meta" className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground block">
                        Titre META (SEO)
                      </label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {current.seoTitle?.length || 0}/60 car.
                      </span>
                    </div>
                    <input
                      type="text"
                      value={current.seoTitle || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, seoTitle: e.target.value }))
                      }
                      placeholder={t`Ex. Le Carnet de Sarah — Écrits & Analyses`}
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Titre affiché en gras sur Google et lors des partages sur les réseaux.
                    </span>
                  </div>

                  {/* Meta Description */}
                  <div className="space-y-1.5 pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground block">
                        Description META
                      </label>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {current.seoDescription?.length || 0}/160 car.
                      </span>
                    </div>
                    <textarea
                      value={current.seoDescription || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, seoDescription: e.target.value }))
                      }
                      placeholder={t`Description concise de votre ligne éditoriale pour les moteurs de recherche...`}
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Extrait descriptif affiché sous le titre dans les résultats de recherche.
                    </span>
                  </div>

                  {/* Indexation Switch */}
                  <div
                    id="indexing"
                    className="pt-3 border-t border-border/30 flex items-center justify-between gap-4"
                  >
                    <div>
                      <label className="text-xs font-semibold text-foreground block">
                        Indexation par les moteurs de recherche
                      </label>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Autoriser les robots de Google, Bing et DuckDuckGo à référencer vos
                        articles.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={current.allowIndexing}
                        onChange={(e) =>
                          setCurrent((prev) => ({ ...prev, allowIndexing: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-background after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>

                {/* Footer Text */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3 shadow-2xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Pied de page (Footer)
                  </h3>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      Mention de pied de page
                    </label>
                    <textarea
                      value={current.footerText || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, footerText: e.target.value }))
                      }
                      placeholder={t`Ex. Tous droits réservés. Écrit avec passion sur qoefi.`}
                      rows={2}
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                    />
                    <span className="text-[11px] text-muted-foreground block">
                      Mention affichée en bas de chaque page de votre site.
                    </span>
                  </div>
                </div>
              </div>

              {/* Aperçu SEO en direct */}
              <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                <SeoPreview
                  name={current.name}
                  subdomain={current.subdomain}
                  customDomain={current.customDomain}
                  seoTitle={current.seoTitle}
                  seoDescription={current.seoDescription}
                  headerImageUrl={current.headerImageUrl}
                  logoUrl={current.logoUrl}
                  allowIndexing={current.allowIndexing}
                />
              </div>
            </motion.div>
          )}

          {/* TAB 4: DOMAINE & DNS */}
          {activeTab === 'domain' && (
            <motion.div
              key="tab-domain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="max-w-3xl space-y-6"
            >
              <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Adresse & Sous-domaine
                </h3>

                {/* Subdomain */}
                <div id="subdomain" className="space-y-2">
                  <label className="text-xs font-semibold text-foreground block">
                    Sous-domaine qoefi
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={subdomainInput}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                        setSubdomainInput(val);
                        setCurrent((prev) => ({ ...prev, subdomain: val }));
                      }}
                      className="w-full pl-3.5 pr-20 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                      placeholder="mon-espace"
                    />
                    <span className="absolute right-3 text-xs text-muted-foreground select-none font-mono">
                      .qoe.fi
                    </span>
                  </div>

                  <div>
                    {subdomainCheck.loading && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" /> Vérification...
                      </span>
                    )}
                    {!subdomainCheck.loading && subdomainCheck.available === true && (
                      <span className="text-xs text-success font-medium flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Sous-domaine disponible.
                      </span>
                    )}
                    {!subdomainCheck.loading && subdomainCheck.available === false && (
                      <span className="text-xs text-destructive font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />{' '}
                        {subdomainCheck.error || 'Indisponible.'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Custom Domain */}
                <div id="custom" className="space-y-2.5 pt-4 border-t border-border/30">
                  <label className="text-xs font-semibold text-foreground block">
                    Domaine personnalisé propre
                  </label>
                  <input
                    type="text"
                    value={current.customDomain || ''}
                    onChange={(e) =>
                      setCurrent((prev) => ({ ...prev, customDomain: e.target.value }))
                    }
                    placeholder="journal.mon-domaine.com"
                    className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                  />

                  <div className="p-3.5 bg-muted/30 border border-border/40 rounded-lg space-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground block">
                      Configuration DNS recommandée :
                    </span>
                    <p>
                      Créez un enregistrement CNAME pointant vers{' '}
                      <code className="text-primary font-mono font-medium">cname.qoe.fi</code> chez
                      votre fournisseur de domaine.
                    </p>
                  </div>
                </div>

                {/* Support Contact */}
                <div className="space-y-2 pt-4 border-t border-border/30">
                  <label className="text-xs font-semibold text-foreground block">
                    Support & Lien de contact
                  </label>
                  <input
                    type="text"
                    value={current.supportUrl || ''}
                    onChange={(e) =>
                      setCurrent((prev) => ({ ...prev, supportUrl: e.target.value }))
                    }
                    placeholder="contact@votre-domaine.com ou https://support.votre-domaine.com"
                    className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: NAVIGATION & LIENS */}
          {activeTab === 'navigation' && (
            <motion.div
              key="tab-navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="max-w-3xl space-y-6"
            >
              {/* Header Links */}
              <div
                id="links"
                className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/30">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Menu de navigation du site
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Liens et onglets affichés en haut de votre publication.
                    </p>
                  </div>
                  <button
                    onClick={addNavigationLink}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter un onglet</span>
                  </button>
                </div>

                {current.navigation.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
                    Aucun lien de menu configuré pour le moment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {current.navigation.map((nav, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg"
                      >
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            disabled={idx === 0}
                            onClick={() => reorderNavigationLink(idx, 'up')}
                            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            disabled={idx === current.navigation.length - 1}
                            onClick={() => reorderNavigationLink(idx, 'down')}
                            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={nav.label}
                          onChange={(e) => {
                            const updated = [...current.navigation];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setCurrent((prev) => ({ ...prev, navigation: updated }));
                          }}
                          placeholder={t`Intitulé`}
                          className="w-1/3 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                        />

                        <input
                          type="text"
                          value={nav.url || ''}
                          onChange={(e) => {
                            const updated = [...current.navigation];
                            updated[idx] = { ...updated[idx], url: e.target.value };
                            setCurrent((prev) => ({ ...prev, navigation: updated }));
                          }}
                          placeholder="https://"
                          className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                        />

                        <button
                          onClick={() => removeNavigationLink(idx)}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Social Networks */}
              <div
                id="social"
                className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
              >
                <div className="pb-2 border-b border-border/30">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Réseaux sociaux
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connectez vos profils externes pour vos lecteurs.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_SOCIAL_PLATFORMS.map((plat) => {
                    const isConnected = current.socialLinks.some((s) => s.platform === plat.id);
                    return (
                      <button
                        key={plat.id}
                        disabled={isConnected}
                        onClick={() => addSocialLink(plat.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          isConnected
                            ? 'bg-muted/20 border-border/20 text-muted-foreground/40 cursor-not-allowed'
                            : 'border-border/40 bg-muted/20 hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        {plat.name} {isConnected && '✓'}
                      </button>
                    );
                  })}
                </div>

                {current.socialLinks.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    {current.socialLinks.map((s, idx) => (
                      <div
                        key={s.platform}
                        className="flex items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg"
                      >
                        <span className="text-xs font-semibold text-foreground capitalize w-24 px-1 truncate">
                          {s.platform}
                        </span>
                        <input
                          type="text"
                          value={s.url}
                          onChange={(e) => {
                            const updated = [...current.socialLinks];
                            updated[idx] = { ...updated[idx], url: e.target.value };
                            setCurrent((prev) => ({ ...prev, socialLinks: updated }));
                          }}
                          className="flex-1 px-3 py-1.5 bg-background border border-border/40 rounded text-xs font-medium text-foreground focus:outline-none"
                        />
                        <button
                          onClick={() => removeSocialLink(idx)}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
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
      </main>

      {/* =====================================================================
          DISCRET BOTTOM SAVE BAR (Only when modified)
          ===================================================================== */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 right-8 z-30 bg-card border border-border/60 text-card-foreground rounded-2xl shadow-xl p-3.5 flex items-center gap-4 select-none backdrop-blur-md"
          >
            <span className="text-xs text-muted-foreground font-medium px-1">
              Modifications non enregistrées
            </span>

            <div className="flex items-center gap-2">
              <button
                disabled={isSaving}
                onClick={handleDiscardChanges}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                disabled={isSaving}
                onClick={handleSaveAll}
                className="px-4 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Enregistrer (⌘S)</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
