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
import { Badge } from '@qoe/ui/badge';
import { Button, buttonClasses } from '@qoe/ui/button';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { URLS } from '@qoe/config';
import { ExternalLink, Check, Loader2, Palette, Search, Globe, Compass, Users } from 'lucide-react';

import {
  updateCreatorProfileAction,
  checkSubdomainAvailabilityAction,
  updateSubdomainAction,
  saveNavigationLinksAction,
  saveSocialLinksAction,
} from '@qoe/sdk/actions/dashboard';

import type { CreatorProfile, ClientSocialLink } from './types';

import { GeneralTab } from './tabs/general';
import { RecommendationsTab } from './tabs/recommendations';
import { SeoTab } from './tabs/seo';
import { DomainTab } from './tabs/domain';
import { NavigationTab } from './tabs/navigation';

export interface SettingsProps {
  initialCreator: CreatorProfile;
  publicationId?: string;
}

export type TabType = 'general' | 'recommendations' | 'domain' | 'navigation' | 'seo';

export default function SettingsView({ initialCreator, publicationId }: SettingsProps) {
  // ── 💾 STATE MANAGEMENT ──
  const [original, setOriginal] = useState<CreatorProfile>(initialCreator);
  const [current, setCurrent] = useState<CreatorProfile>(initialCreator);
  const isMediaWorkspace = initialCreator.isMedia ?? false;
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Ecoute des events depuis le CmdK / hash URL
  useEffect(() => {
    const handleHashChange = (hashToUse?: string) => {
      const hash = hashToUse || window.location.hash;
      if (!hash) return;

      const tabMatch = hash.match(/^#(general|recommendations|domain|navigation|seo)/);
      if (tabMatch) {
        setActiveTab(tabMatch[1] as TabType);
      } else {
        // Ancres de section : retrouver l'onglet qui les contient (Cmd+K).
        const sectionTabs: Record<string, TabType> = {
          categories: 'navigation',
          links: 'navigation',
          social: 'seo',
          meta: 'seo',
          indexing: 'seo',
        };
        const section = hash.substring(1).split('#').pop() || '';
        const tab = sectionTabs[section];
        if (tab) setActiveTab(tab);
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
        'themeMode',
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
        const profileResult = await updateCreatorProfileAction({
          publicationId,
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
          supportUrl: current.supportUrl,
          siteOptions: current.siteOptions ?? {},
        });
        if (!profileResult.ok) {
          throw new Error(profileResult.error.message || 'Erreur de sauvegarde.');
        }
      }

      if (current.subdomain !== original.subdomain) {
        if (current.subdomain) {
          if (subdomainCheck.available === false) {
            throw new Error(`Sous-domaine invalide : ${subdomainCheck.error}`);
          }
          const subResult = await updateSubdomainAction({
            publicationId,
            subdomain: current.subdomain,
          });
          if (!subResult.ok) {
            throw new Error(
              subResult.error?.message || 'Erreur lors de la mise à jour du sous-domaine.'
            );
          }
        } else {
          const subResult = await updateSubdomainAction({
            publicationId,
            subdomain: '',
          });
          if (!subResult.ok) {
            throw new Error(
              subResult.error?.message || 'Erreur lors de la suppression du sous-domaine.'
            );
          }
        }
      }

      const navChanged = JSON.stringify(current.navigation) !== JSON.stringify(original.navigation);
      if (navChanged) {
        const navResult = await saveNavigationLinksAction({
          publicationId,
          links: current.navigation,
        });
        if (!navResult.ok) {
          throw new Error(
            navResult.error?.message || 'Erreur lors de la sauvegarde de la navigation.'
          );
        }
      }

      const socialChanged =
        JSON.stringify(current.socialLinks) !== JSON.stringify(original.socialLinks);
      if (socialChanged) {
        const socialResult = await saveSocialLinksAction({
          publicationId,
          links: current.socialLinks,
        });
        if (!socialResult.ok) {
          throw new Error(
            socialResult.error?.message || 'Erreur lors de la sauvegarde des réseaux sociaux.'
          );
        }
      }

      // Les catégories ne sont plus modifiables ici : création, renommage,
      // slug et hiérarchie vivent dans Articles → Catégories.
      toast.success(t`Paramètres enregistrés.`);
      setOriginal(current);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de sauvegarde.';
      if (
        msg.includes('Server Action') ||
        msg.includes('Failed to find Server Action') ||
        msg.includes('older or newer deployment')
      ) {
        toast.error(
          t`Une nouvelle version a été déployée. La page va se recharger pour synchroniser vos réglages.`
        );
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(msg);
      }
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
    { id: 'recommendations' as const, label: t`Recommandations`, icon: Users },
    { id: 'seo' as const, label: t`SEO & Réseaux`, icon: Search },
    { id: 'domain' as const, label: t`Domaine & DNS`, icon: Globe },
    { id: 'navigation' as const, label: t`Menu & liens`, icon: Compass },
  ];

  return (
    <div className="w-full pb-24 text-foreground">
      {/* ── HEADER SUPÉRIEUR ÉPURÉ ── */}
      <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between gap-4 py-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {current.name || 'Paramètres'}
              </h1>
              {isMediaWorkspace && (
                <Badge
                  variant="outline"
                  tone="brand"
                  shape="pill"
                  className="uppercase tracking-wider"
                >
                  Média
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isMediaWorkspace
                ? `Configuration du média « ${current.name} »`
                : t`Configuration du site`}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href={publicBlogUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              suppressHydrationWarning
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              <span>Voir le site</span>
              <ExternalLink />
            </a>

            <Button
              variant="solid"
              tone="brand"
              size="sm"
              disabled={!hasChanges || isSaving}
              onClick={handleSaveAll}
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <span>Enregistrer</span>
              )}
            </Button>
          </div>
        </div>

        {/* Barre d'onglets */}
        <div>
          <Tabs
            variant="underline"
            size="sm"
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as TabType)}
          >
            <TabList aria-label={t`Sections des paramètres`} className="border-b-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Tab key={tab.id} id={tab.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5" />
                      <span>{tab.label}</span>
                    </span>
                  </Tab>
                );
              })}
            </TabList>
          </Tabs>
        </div>
      </header>

      {/* ── CONTENU DES ONGLETS ── */}
      <main className="pt-6">
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
                publicBlogUrl={publicBlogUrl}
              />
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
                addSocialLink={addSocialLink}
                removeSocialLink={removeSocialLink}
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
                removeNavigationLink={removeNavigationLink}
                reorderNavigationLink={reorderNavigationLink}
                hasUnsavedChanges={hasChanges}
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
            className="fixed bottom-6 right-8 z-30 flex items-center gap-4 rounded-xl border border-border/60 bg-card p-3 text-card-foreground shadow-lg select-none backdrop-blur-md"
          >
            <span className="text-xs text-muted-foreground font-medium px-1">
              Modifications non enregistrées
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="soft"
                tone="neutral"
                size="sm"
                disabled={isSaving}
                onClick={handleDiscardChanges}
              >
                Annuler
              </Button>

              <Button
                variant="solid"
                tone="brand"
                size="sm"
                disabled={isSaving}
                onClick={handleSaveAll}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check />
                    <span>Enregistrer (⌘S)</span>
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Compat export
export { SettingsView as PublicationSettings };
