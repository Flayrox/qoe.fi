// =====================================================================
// ⚡ QOE Creator Publication Settings — apps/dashboard/src/features/settings/components/visual-studio.tsx
// =====================================================================
// Pure, Minimalist Creator Settings Console (Ghost CMS & Vercel Settings Style).
// 100% Theme-Agnostic Semantic Tokens (@qoe/theme). Zero AI Slop.
// =====================================================================

'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';
import { URLS } from '@qoe/config';
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
  User,
} from 'lucide-react';

// Import Server Actions
import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction,
} from '@qoe/api-client/actions/dashboard';

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
}

type TabType = 'general' | 'domain' | 'navigation' | 'seo';

export default function VisualStudio({ initialCreator }: VisualStudioProps) {
  // =====================================================================
  // 💾 STATE MANAGEMENT
  // =====================================================================
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator);
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator);
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ecoute des events depuis le CmdK
  useEffect(() => {
    const handleHashChange = (hashToUse?: string) => {
      const hash = hashToUse || window.location.hash;
      if (!hash) return;

      const tabMatch = hash.match(/^#(general|domain|navigation|seo)/);
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
        error: 'Le sous-domaine ne peut pas être vide.',
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
          error: 'Erreur de vérification.',
        });
      }
    }
    check();
  }, [debouncedSubdomain, original.subdomain]);

  const hasChanges = JSON.stringify(current) !== JSON.stringify(original);

  const getPublicBlogUrl = () => {
    if (typeof window === 'undefined') return `http://${current.subdomain || 'climat'}.lvh.me:3001`;
    const host = window.location.hostname;
    const activeSub = current.subdomain || 'climat';
    if (host.includes('lvh.me')) {
      return `http://${activeSub}.lvh.me:3001`;
    }
    if (host.includes('qoe.test')) {
      return `http://${activeSub}.qoe.test:3001`;
    }
    if (host.includes('localhost')) {
      return `http://${activeSub}.lvh.me:3001`;
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
    toast.info('Modifications annulées.');
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

      toast.success('Paramètres enregistrés.');
      setOriginal(current);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

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

  return (
    <div className="w-full min-h-screen bg-background text-foreground font-sans pb-24">
      {/* =====================================================================
          TOP HEADER (Ghost / Vercel Settings Header)
          ===================================================================== */}
      <header className="w-full border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Paramètres de la publication
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configuration de votre espace d'écriture sur qoe.fi
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={publicBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <span>Voir le site</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              disabled={!hasChanges || isSaving}
              onClick={handleSaveAll}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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

        {/* Informative banner pointing to personal user account settings */}
        <div className="max-w-3xl mx-auto px-6 pb-5">
          <div className="p-3 bg-muted/40 border border-border/50 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4 text-primary shrink-0" />
              <span>
                Vous personnalisez le design et la configuration du média. Pour vos données
                personnelles (mot de passe, email) :
              </span>
            </div>
            <a
              href={consoleSettingsUrl}
              className="shrink-0 px-2.5 py-1 bg-background hover:bg-muted border border-border/60 rounded-lg font-semibold text-foreground text-[11px] transition-colors flex items-center gap-1"
            >
              <span>Mon Compte</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Minimal Tab Bar */}
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex gap-6 border-b border-border/40">
            {(
              [
                { id: 'general', label: 'Général' },
                { id: 'domain', label: 'Domaine & DNS' },
                { id: 'navigation', label: 'Navigation & Réseaux' },
                { id: 'seo', label: 'SEO & Pied de page' },
              ] as const
            ).map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-xs font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
                    isSelected
                      ? 'border-primary text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN SETTINGS STAGE (Ultra-Clean Ghost / Vercel Form Rows)
          ===================================================================== */}
      <main className="max-w-3xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {/* TAB 1: GÉNÉRAL */}
          {activeTab === 'general' && (
            <motion.div
              key="tab-general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="space-y-8"
            >
              <div className="divide-y divide-border/30">
                {/* Title */}
                <div id="name" className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Nom de la publication
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Titre principal de votre blog.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={current.name || ''}
                      onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex. Le Carnet de Sarah"
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                  </div>
                </div>

                {/* Slogan */}
                <div id="hero" className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Slogan (Hero Tagline)
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Brève présentation sous le titre principal.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <textarea
                      value={current.heroText || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, heroText: e.target.value }))
                      }
                      placeholder="Ex. Réflexions sur la technologie, l'art et l'écriture libre..."
                      rows={3}
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none"
                    />
                  </div>
                </div>

                {/* Accent Color Swatches */}
                <div id="brand" className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Couleur d'accentuation
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Teinte des éléments interactifs et boutons.
                    </span>
                  </div>
                  <div className="sm:col-span-2 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {ACCENT_SWATCHES.map((swatch) => {
                        const isSelected =
                          current.accentColor?.toLowerCase() === swatch.hex.toLowerCase();
                        return (
                          <button
                            key={swatch.id}
                            onClick={() =>
                              setCurrent((prev) => ({ ...prev, accentColor: swatch.hex }))
                            }
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border/30 bg-muted/20 hover:bg-muted/50 text-muted-foreground'
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
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="color"
                        value={current.accentColor || '#EE4B2B'}
                        onChange={(e) =>
                          setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded border border-border/30 cursor-pointer bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={current.accentColor || '#EE4B2B'}
                        onChange={(e) =>
                          setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                        className="w-32 px-3 py-1.5 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Typography */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Police éditoriale
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Famille de polices pour les titres et le corps.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      value={current.fontFamily || 'sans'}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, fontFamily: e.target.value }))
                      }
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    >
                      {SITE_FONTS.map((font) => (
                        <option key={font.id} value={font.id}>
                          {font.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Avatar / Logo URL */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Avatar / Logo (URL)
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Icône ronde affichée en en-tête.
                    </span>
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <input
                      type="text"
                      value={current.logoUrl || ''}
                      onChange={(e) => setCurrent((prev) => ({ ...prev, logoUrl: e.target.value }))}
                      placeholder="https://domaine.com/logo.png"
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                    {current.logoUrl && (
                      <div className="flex items-center gap-2">
                        <Image
                          src={current.logoUrl}
                          alt="Logo"
                          width={28}
                          height={28}
                          className="w-7 h-7 rounded-full object-cover border border-border/30"
                          unoptimized
                        />
                        <span className="text-xs text-muted-foreground">Aperçu</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cover Image URL */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Image de couverture (URL)
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Bannière d'arrière-plan d'en-tête.
                    </span>
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <input
                      type="text"
                      value={current.headerImageUrl || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, headerImageUrl: e.target.value }))
                      }
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: DOMAINE & DNS */}
          {activeTab === 'domain' && (
            <motion.div
              key="tab-domain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="space-y-8"
            >
              <div className="divide-y divide-border/30">
                {/* Subdomain */}
                <div
                  id="subdomain"
                  className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start"
                >
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Sous-domaine qoe.fi
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Votre adresse publique sur qoe.fi.
                    </span>
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={subdomainInput}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                          setSubdomainInput(val);
                          setCurrent((prev) => ({ ...prev, subdomain: val }));
                        }}
                        className="w-full pl-3.5 pr-20 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                        placeholder="mon-espace"
                      />
                      <span className="absolute right-3 text-xs text-muted-foreground select-none">
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
                          <CheckCircle className="w-3 h-3" /> Sous-domaine disponible.
                        </span>
                      )}
                      {!subdomainCheck.loading && subdomainCheck.available === false && (
                        <span className="text-xs text-destructive font-medium flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />{' '}
                          {subdomainCheck.error || 'Indisponible.'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Custom Domain */}
                <div id="custom" className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Domaine personnalisé
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Pointez votre nom de domaine DNS propre.
                    </span>
                  </div>
                  <div className="sm:col-span-2 space-y-3">
                    <input
                      type="text"
                      value={current.customDomain || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, customDomain: e.target.value }))
                      }
                      placeholder="journal.mon-domaine.com"
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />

                    <div className="p-3 bg-muted/30 border border-border/30 rounded-lg space-y-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground block">
                        Configuration CNAME DNS :
                      </span>
                      <p>
                        Créez un enregistrement CNAME pointant vers{' '}
                        <span className="text-primary font-medium">cname.qoe.fi</span> chez votre
                        registrar.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Support Contact */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Support & Contact
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Email ou lien d'aide pour vos abonnés.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={current.supportUrl || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, supportUrl: e.target.value }))
                      }
                      placeholder="https://support.votre-site.com ou contact@votre-site.com"
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: NAVIGATION & RÉSEAUX */}
          {activeTab === 'navigation' && (
            <motion.div
              key="tab-navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="space-y-8"
            >
              {/* Header Links */}
              <div id="links" className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/30">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Menu de navigation principal
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Onglets affichés dans l'en-tête de votre site.
                    </p>
                  </div>
                  <button
                    onClick={addNavigationLink}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold border border-border/30 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter un lien</span>
                  </button>
                </div>

                {current.navigation.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-border/40 rounded-lg text-xs text-muted-foreground">
                    Aucun lien de menu.
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
                          placeholder="Intitulé"
                          className="w-1/3 px-3 py-1.5 bg-background border border-border/30 rounded text-xs font-medium text-foreground focus:outline-none"
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
                          className="flex-1 px-3 py-1.5 bg-background border border-border/30 rounded text-xs font-medium text-foreground focus:outline-none"
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
              <div id="social" className="space-y-4 pt-6 border-t border-border/30">
                <div className="pb-2 border-b border-border/30">
                  <h2 className="text-sm font-semibold text-foreground">Réseaux sociaux</h2>
                  <p className="text-xs text-muted-foreground">Liens vers vos profils externes.</p>
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
                            : 'bg-muted/30 hover:bg-muted border-border/30 text-foreground'
                        }`}
                      >
                        + {plat.name}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2 pt-2">
                  {current.socialLinks.map((soc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg"
                    >
                      <span className="text-xs font-semibold uppercase px-2.5 py-1 bg-muted border border-border/30 rounded shrink-0 w-24 text-center select-none text-muted-foreground">
                        {soc.platform}
                      </span>

                      <input
                        type="text"
                        value={soc.url}
                        onChange={(e) => {
                          const updated = [...current.socialLinks];
                          updated[idx] = { ...updated[idx], url: e.target.value };
                          setCurrent((prev) => ({ ...prev, socialLinks: updated }));
                        }}
                        placeholder="https://"
                        className="flex-1 px-3 py-1.5 bg-background border border-border/30 rounded text-xs font-medium text-foreground focus:outline-none"
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
              </div>
            </motion.div>
          )}

          {/* TAB 4: SEO & PIED DE PAGE */}
          {activeTab === 'seo' && (
            <motion.div
              key="tab-seo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="space-y-8"
            >
              <div className="divide-y divide-border/30">
                {/* Meta Title */}
                <div id="meta" className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Titre META (SEO)
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Titre affiché sur Google et réseaux.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={current.seoTitle || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, seoTitle: e.target.value }))
                      }
                      placeholder="Ex. Le Carnet de Sarah — Écrits & Analyses"
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80"
                    />
                  </div>
                </div>

                {/* Meta Description */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Description META
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Résumé affiché dans les résultats de recherche.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <textarea
                      value={current.seoDescription || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, seoDescription: e.target.value }))
                      }
                      placeholder="Description concise de votre ligne éditoriale..."
                      rows={3}
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none"
                    />
                  </div>
                </div>

                {/* Search Engine Indexing */}
                <div
                  id="indexing"
                  className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center"
                >
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Indexation moteur
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Référencement public.
                    </span>
                  </div>
                  <div className="sm:col-span-2 flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={current.allowIndexing}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, allowIndexing: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-border/40 text-primary focus:ring-primary cursor-pointer"
                    />
                    <span className="text-xs text-foreground font-medium">
                      Autoriser les robots d'indexation Google
                    </span>
                  </div>
                </div>

                {/* Footer Text */}
                <div className="py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Texte de pied de page
                    </label>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Message en bas de page.
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <textarea
                      value={current.footerText || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, footerText: e.target.value }))
                      }
                      placeholder="Ex. Tous droits réservés. Merci de votre lecture."
                      rows={2}
                      className="w-full px-3.5 py-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none"
                    />
                  </div>
                </div>
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
            className="fixed bottom-6 right-8 z-30 bg-card border border-border/50 text-card-foreground rounded-xl shadow-lg p-3 flex items-center gap-4 select-none"
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
                className="px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
  );
}
