'use client';

// =====================================================================
// ⚡ QOE Studio Settings — apps/studio/src/features/settings/settings.tsx
// =====================================================================
// Orchestrateur léger et modulaire des paramètres de publication.
// Découpé en modules ciblés : tabs/{general, emails, seo, domain, navigation}
// =====================================================================

import React, { useState, useEffect } from 'react';
import { t } from '@lingui/core/macro';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import { toast } from '@qoe/ui/toast';
import { URLS } from '@qoe/config';
import {
  ExternalLink,
  Check,
  Loader2,
  Palette,
  Mail,
  Search,
  Globe,
  Compass,
  Terminal,
  Sparkles,
} from 'lucide-react';

import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction,
} from '@qoe/sdk/actions/dashboard';
import { saveCategoryAction, deleteCategoryAction } from '@qoe/sdk/actions/articles';

import type { CreatorProfile, ClientNavigationItem, ClientSocialLink } from './types';

import { GeneralTab } from './tabs/general';
import { EmailsTab } from './tabs/emails';
import { RecommendationsTab } from './tabs/recommendations';
import { SeoTab } from './tabs/seo';
import { DomainTab } from './tabs/domain';
import { NavigationTab } from './tabs/navigation';

export interface SettingsProps {
  initialCreator: CreatorProfile;
  publicationId?: string;
}

export type TabType = 'general' | 'emails' | 'recommendations' | 'domain' | 'navigation' | 'seo';

export default function SettingsView({ initialCreator, publicationId }: SettingsProps) {
  // ── 💾 STATE MANAGEMENT ──
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator);
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator);
  const isMediaWorkspace = initialCreator.isMedia ?? false;
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isAdvancedMode, setIsAdvancedMode] = useState<boolean>(
    initialCreator.advancedSettingsMode ?? false
  );

  // Ecoute des events depuis le CmdK / hash URL
  useEffect(() => {
    const handleHashChange = (hashToUse?: string) => {
      const hash = hashToUse || window.location.hash;
      if (!hash) return;

      const tabMatch = hash.match(/^#(general|emails|recommendations|domain|navigation|seo)/);
      if (tabMatch) {
        setActiveTab(tabMatch[1] as TabType);
      }

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

  // Validation du sous-domaine
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

  const [publicBlogUrl, setPublicBlogUrl] = useState<string>('');

  useEffect(() => {
    setIsMounted(true);
    const host = window.location.hostname;
    const activeSub = current.subdomain || 'climat';
    const isCaddy = !window.location.port;
    if (host.includes('lvh.me')) {
      setPublicBlogUrl(`http://${activeSub}.lvh.me${isCaddy ? '' : ':15403'}`);
    } else if (host.includes('qoe.test')) {
      setPublicBlogUrl(`http://${activeSub}.qoe.test`);
    } else if (host.includes('localhost')) {
      setPublicBlogUrl(`http://${activeSub}.lvh.me:15403`);
    } else {
      setPublicBlogUrl(`https://${activeSub}.qoe.fi`);
    }
  }, [current.subdomain]);

  const consoleSettingsUrl = isMounted ? `${URLS.CONSOLE}/settings` : '#';

  // ── ⚙️ MUTATION HANDLERS ──
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
        'layoutStyle',
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

      const siteOptionsChanged =
        JSON.stringify(current.siteOptions ?? {}) !== JSON.stringify(original.siteOptions ?? {});

      if (profileFieldsChanged || siteOptionsChanged) {
        await updateCreatorProfileAction({
          name: current.name,
          heroText: current.heroText,
          accentColor: current.accentColor,
          fontFamily: current.fontFamily,
          layoutStyle: current.layoutStyle,
          logoUrl: current.logoUrl,
          headerImageUrl: current.headerImageUrl,
          footerText: current.footerText,
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          allowIndexing: current.allowIndexing,
          supportUrl: current.supportUrl,
          siteOptions: current.siteOptions ?? {},
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

      const categoriesChanged =
        JSON.stringify(current.categories) !== JSON.stringify(original.categories);
      if (categoriesChanged) {
        const currentIds = new Set(current.categories.map((c) => c.id));
        for (const orig of original.categories) {
          if (!currentIds.has(orig.id)) {
            await deleteCategoryAction(orig.id);
          }
        }
        for (const cat of current.categories) {
          const isNew =
            cat.id.startsWith('temp-') || !original.categories.some((o) => o.id === cat.id);
          await saveCategoryAction({
            id: isNew ? undefined : cat.id,
            name: cat.name,
            slug: cat.slug,
            parentId: cat.parentId || null,
          });
        }
      }

      toast.success(t`Paramètres enregistrés.`);
      setOriginal(current);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut: ⌘S
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

  // Helpers Navigation
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

  // Helpers Réseaux sociaux
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
    { id: 'general' as const, label: t`Identité & Design`, icon: Palette },
    { id: 'emails' as const, label: t`Emails & Abonnés`, icon: Mail },
    { id: 'recommendations' as const, label: t`Recommandations`, icon: Sparkles },
    { id: 'seo' as const, label: t`SEO & Réseaux`, icon: Search },
    { id: 'domain' as const, label: t`Domaine & DNS`, icon: Globe },
    { id: 'navigation' as const, label: t`Navigation & Liens`, icon: Compass },
  ];

  return (
    <div className="w-full min-h-screen bg-background text-foreground font-sans pb-28">
      {/* ── HEADER SUPÉRIEUR ÉPURÉ ── */}
      <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {current.name || 'Paramètres du Site Web'}
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
                : t`Configuration et design de votre site web souverain`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const next = !isAdvancedMode;
                setIsAdvancedMode(next);
                if (next) {
                  toast.success(t`Mode Avancé débloqué`);
                } else {
                  toast.info(t`Mode Standard réactivé`);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                isAdvancedMode
                  ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary shadow-2xs'
                  : 'border-border/50 bg-muted/20 hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{isAdvancedMode ? 'Mode Avancé' : 'Mode Standard'}</span>
            </button>

            <a
              href={publicBlogUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              suppressHydrationWarning
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

        {/* Barre d'onglets */}
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

      {/* ── CONTENU DES ONGLETS ── */}
      <main className="max-w-6xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div
              key="tab-general"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <GeneralTab
                current={current}
                setCurrent={setCurrent}
                consoleSettingsUrl={consoleSettingsUrl}
              />
            </motion.div>
          )}

          {activeTab === 'emails' && (
            <motion.div
              key="tab-emails"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <EmailsTab publicationId={publicationId} />
            </motion.div>
          )}

          {activeTab === 'recommendations' && (
            <motion.div
              key="tab-recommendations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <RecommendationsTab current={current} setCurrent={setCurrent} />
            </motion.div>
          )}

          {activeTab === 'seo' && (
            <motion.div
              key="tab-seo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SeoTab
                current={current}
                setCurrent={setCurrent}
                isAdvancedMode={isAdvancedMode}
                setIsAdvancedMode={setIsAdvancedMode}
              />
            </motion.div>
          )}

          {activeTab === 'domain' && (
            <motion.div
              key="tab-domain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <DomainTab
                current={current}
                setCurrent={setCurrent}
                subdomainInput={subdomainInput}
                setSubdomainInput={setSubdomainInput}
                subdomainCheck={subdomainCheck}
              />
            </motion.div>
          )}

          {activeTab === 'navigation' && (
            <motion.div
              key="tab-navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <NavigationTab
                current={current}
                setCurrent={setCurrent}
                addNavigationLink={addNavigationLink}
                removeNavigationLink={removeNavigationLink}
                reorderNavigationLink={reorderNavigationLink}
                addSocialLink={addSocialLink}
                removeSocialLink={removeSocialLink}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── BARRE FLOTTANTE DE SAUVEGARDE EN BAS ── */}
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

// Compat export
export { SettingsView as PublicationSettings };
