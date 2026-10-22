'use client';

// =====================================================================
// 🪶 MinimalCraftShell.tsx — Enveloppe d'Archétype Minimal Craft
// =====================================================================
// Réplique fidèle et ultra-raffinée de Devouring Details (devouringdetails.com)
// & Rauno Freiberg (rauno.me).
//
// Composants souverains :
// 1. En-tête fixe supérieur (top-8 sm:top-12) : bouton toggle sidebar, fil d'Ariane, pastille marque settings
// 2. Dégradé flou progressif (haut & bas) passant SOUS l'en-tête (z-20)
// 3. Contenu principal d'orfèvre (z-10)
// 4. Réglette latérale Devouring Details (platform_sidebar, platform_tick, platform_label, data-open="true|false")
// 5. Dock contextuel inférieur arrondi (platform_footer)
// =====================================================================

import React, { useState, useContext } from 'react';
import { ChevronDown, ArrowLeft, Search, Share2, Check } from 'lucide-react';
import { cn } from '@qoe/utils';
import { ProgressiveBlur } from '../../../ui/progressive-blur';
import {
  CraftSidebarDrawer,
  SidebarToggleIcon,
  type CraftDrawerItem,
} from '../../../ui/craft-sidebar-drawer';
import { MinimalDock } from './MinimalDock';
import type { TemplatePublicationContext, TemplateArticleItem } from '../../schema';
import { AuthModalContext } from '../../../auth/AuthModalContext';

export interface MinimalCraftShellProps {
  publication: TemplatePublicationContext;
  article?: TemplateArticleItem | null;
  articles?: TemplateArticleItem[];
  activeCategory?: import('../../schema').TemplateCategoryItem | null;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MinimalCraftShell({
  publication,
  article,
  articles = [],
  activeCategory: propActiveCategory,
  children,
  className = '',
  style,
}: MinimalCraftShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeDropdownCatId, setActiveDropdownCatId] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const authContext = useContext(AuthModalContext);

  const accentColor = publication.accentColor || '#F97316';
  const displayName =
    publication.name || publication.domain || publication.subdomain || 'Mon Carnet';
  const siteOptions = publication.siteOptions ?? {};

  // 📌 Sidebar mise de côté pour notre to-do future : désactivée par défaut
  const showCraftIndex = Boolean(siteOptions.showCraftIndex);
  const showProgressiveBlur = (siteOptions.showProgressiveBlur ?? true) !== false;
  const showBanner = (siteOptions.showBanner ?? true) !== false;
  const headerWordmarkUrl = showBanner ? publication.headerImageUrl || null : null;
  const isLogoSquare = siteOptions.logoShape === 'square' || Boolean(siteOptions.logoShapeSquare);
  const showLogo = (siteOptions.showLogo ?? true) !== false;
  const showCategoryTabs = (siteOptions.showCategoryTabs ?? true) !== false;

  const hiddenCatIds = new Set((siteOptions.hiddenNavCategoryIds as string[] | undefined) || []);
  const categories = (publication.categories || []).filter((c) => !hiddenCatIds.has(c.id));
  const rootCategories = categories.filter((c) => !c.parentId);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const activeCategory = propActiveCategory || publication.activeCategory || null;
  const activeCategorySlug = activeCategory?.slug || article?.category?.slug || null;

  const isArticleMode = Boolean(article);

  // Préparation des items pour la réglette Devouring Details
  const articleDrawerItems: CraftDrawerItem[] = articles.map((art) => {
    const artSlug = art.slug || art.id;
    const catSlug = art.category?.slug;
    const href = catSlug ? `/${catSlug}/${artSlug}` : `/article/${artSlug}`;

    return {
      id: art.id,
      label: art.title,
      href,
      category: art.category?.name || 'Articles',
      isActive: article?.id === art.id,
    };
  });

  const drawerItems: CraftDrawerItem[] = [
    {
      id: 'home',
      label: 'Accueil',
      href: '/',
      category: 'Navigation',
      isActive: !isArticleMode,
    },
    ...articleDrawerItems,
  ];

  const hasCategoryBar =
    showCategoryTabs &&
    (rootCategories.length > 0 || (publication.navigation && publication.navigation.length > 0));

  const supportLink = publication.stripeAccountId ? '/support' : publication.supportUrl || null;
  const allowSupport = (siteOptions.showSubscribeButton ?? true) !== false;

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: displayName,
          url: window.location.href,
        });
        return;
      } catch {
        // Ignorer l'annulation
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2000);
      } catch (err) {
        console.error('Erreur copie presse-papier:', err);
      }
    }
  };

  const handleLogin = () => {
    if (authContext?.openAuthModal) {
      authContext.openAuthModal({ mode: 'login' });
    } else if (typeof window !== 'undefined') {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.href)}`;
    }
  };

  return (
    <div
      style={style}
      data-sidebar-open={isSidebarOpen ? 'true' : 'false'}
      className={cn(
        'platform_root min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white pb-32 relative',
        hasCategoryBar ? 'pt-28 sm:pt-36' : 'pt-20 sm:pt-28',
        className
      )}
    >
      {/* ── 1. EN-TÊTE FIXE SUPÉRIEUR DEVOURING DETAILS (top-4 sm:top-6 z-40) ── */}
      <header
        data-header="true"
        className="platform_header fixed top-4 sm:top-6 left-6 right-6 z-40 flex items-center justify-between select-none pointer-events-auto text-muted-foreground"
      >
        {/* Côté Gauche : Logo classique + Contrôles de navigation (Sidebar + Retour si mode article) */}
        <div className="flex items-center gap-2.5 shrink-0 z-10 min-w-0">
          {showLogo &&
            (publication.logoUrl ? (
              <a
                href="/"
                className="inline-flex items-center justify-center shrink-0 transition-transform hover:scale-105"
                title={displayName}
              >
                <img
                  src={publication.logoUrl}
                  alt={displayName}
                  className={cn(
                    'w-7 h-7 sm:w-8 sm:h-8 object-cover border border-border/50 shadow-2xs',
                    isLogoSquare ? 'rounded-lg' : 'rounded-full'
                  )}
                />
              </a>
            ) : (
              <a
                href="/"
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 shrink-0 bg-muted/60 border border-border/50 text-[11px] font-bold text-foreground transition-transform hover:scale-105 shadow-2xs',
                  isLogoSquare ? 'rounded-lg' : 'rounded-full'
                )}
                title={displayName}
              >
                {(displayName[0] || 'Q').toUpperCase()}
              </a>
            ))}

          {showCraftIndex && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="hover:bg-muted active:bg-muted/80 m-[-6px] cursor-pointer rounded-md p-1.5 transition-colors shrink-0"
              aria-label="Basculer la sidebar"
              title={isSidebarOpen ? 'Replier la sidebar' : 'Déplier la sidebar'}
            >
              <SidebarToggleIcon isOpen={isSidebarOpen} size={16} />
            </button>
          )}

          {isArticleMode && (
            <a
              href="/"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/60 group"
              title="Retour à l'accueil"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden md:inline text-[11px] font-medium">Accueil</span>
            </a>
          )}
        </div>

        {/* Centre : Identité de marque permanente (Wordmark ou Titre), constante sur Accueil et Article */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto max-w-[70vw] sm:max-w-lg text-center">
          {headerWordmarkUrl ? (
            <a
              href="/"
              className="inline-flex items-center justify-center transition-transform hover:scale-[1.02]"
              title={displayName}
            >
              <img
                src={headerWordmarkUrl}
                alt={displayName}
                className="h-6 sm:h-7 md:h-8 w-auto max-w-[200px] sm:max-w-[280px] object-contain mx-auto"
              />
            </a>
          ) : (
            <a
              href="/"
              className="inline-block transition-opacity hover:opacity-85"
              title={displayName}
            >
              <p
                data-breadcrumb="true"
                aria-label="Nom de la publication"
                className="text-base sm:text-lg md:text-xl font-semibold tracking-tight text-foreground truncate"
              >
                {displayName}
              </p>
            </a>
          )}
        </div>

        {/* Côté Droit : Recherche, Partage, S'abonner, Se connecter */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 z-10 pointer-events-auto">
          {/* Recherche */}
          <a
            href="/search"
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            title="Rechercher"
            aria-label="Rechercher"
          >
            <Search className="w-4 h-4" />
          </a>

          {/* Partage */}
          <button
            type="button"
            onClick={handleShare}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            title="Partager cette publication"
            aria-label="Partager"
          >
            {copiedShare ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
          </button>

          {/* Bouton S'abonner (Pill plein coloré) */}
          {allowSupport && (
            <a
              href={supportLink || '#subscribe'}
              onClick={(e) => {
                if (!supportLink && authContext?.openAuthModal) {
                  e.preventDefault();
                  authContext.openAuthModal({ mode: 'signup', actionContext: 'subscribe' });
                }
              }}
              className="px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold text-white hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xs shrink-0 cursor-pointer"
              style={{ backgroundColor: publication.accentColor || '#C04328' }}
            >
              S'abonner
            </a>
          )}

          {/* Se connecter */}
          <button
            type="button"
            onClick={handleLogin}
            className="hidden sm:inline-block text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0 px-1 py-1.5"
          >
            Se connecter
          </button>
        </div>
      </header>

      {/* ── 1.5. NAVIGATION CENTRÉE ÉPURÉE SANS PILULE (Catégories, Sous-catégories & Liens créateur) ── */}
      {hasCategoryBar && (
        <nav
          aria-label="Navigation des rubriques et pages"
          className="fixed top-12 sm:top-14 left-0 right-0 z-35 flex justify-center pointer-events-none px-4"
        >
          <div className="pointer-events-auto flex items-center justify-center gap-4 sm:gap-6 max-w-[94vw] flex-wrap select-none">
            {/* Onglet Tous les articles / Accueil */}
            <a
              href="/"
              className={cn(
                'text-xs sm:text-[13px] font-medium tracking-tight transition-colors shrink-0',
                !isArticleMode && !activeCategorySlug
                  ? 'text-foreground font-semibold underline underline-offset-4 decoration-2 decoration-[var(--tenant-accent)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Accueil
            </a>

            {/* Rubriques principales et leurs sous-catégories */}
            {rootCategories.map((cat) => {
              const subs = getSubcategories(cat.id);
              const hasSubs = subs.length > 0;
              const isCatActive =
                activeCategorySlug === cat.slug || subs.some((s) => s.slug === activeCategorySlug);
              const isDropdownOpen = activeDropdownCatId === cat.id;

              if (!hasSubs) {
                return (
                  <a
                    key={cat.id}
                    href={`/${cat.slug}`}
                    className={cn(
                      'text-xs sm:text-[13px] font-medium tracking-tight transition-colors shrink-0',
                      isCatActive
                        ? 'text-foreground font-semibold underline underline-offset-4 decoration-2 decoration-[var(--tenant-accent)]'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {cat.name}
                  </a>
                );
              }

              return (
                <div key={cat.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveDropdownCatId(isDropdownOpen ? null : cat.id)}
                    className={cn(
                      'flex items-center gap-1 text-xs sm:text-[13px] font-medium tracking-tight transition-colors select-none cursor-pointer',
                      isCatActive
                        ? 'text-foreground font-semibold underline underline-offset-4 decoration-2 decoration-[var(--tenant-accent)]'
                        : isDropdownOpen
                          ? 'text-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <span>{cat.name}</span>
                    <ChevronDown
                      className={cn(
                        'w-3 h-3 transition-transform opacity-60',
                        isDropdownOpen && 'rotate-180'
                      )}
                    />
                  </button>

                  {isDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setActiveDropdownCatId(null)}
                      />
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 min-w-[170px] rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5 text-left">
                        <a
                          href={`/${cat.slug}`}
                          onClick={() => setActiveDropdownCatId(null)}
                          className={cn(
                            'flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                            activeCategorySlug === cat.slug
                              ? 'bg-muted text-foreground font-semibold'
                              : 'text-foreground hover:bg-muted/70'
                          )}
                        >
                          <span>Tout voir dans {cat.name}</span>
                        </a>
                        <div className="h-px bg-border/40 my-1" />
                        {subs.map((sub) => (
                          <a
                            key={sub.id}
                            href={`/${sub.slug}`}
                            onClick={() => setActiveDropdownCatId(null)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                              activeCategorySlug === sub.slug
                                ? 'bg-muted text-foreground font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                            )}
                          >
                            <span className="opacity-40 font-sans text-[10px]">↳</span>
                            <span>{sub.name}</span>
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Liens de navigation créateur ("À propos", etc.) */}
            {publication.navigation &&
              publication.navigation
                .filter((nav) => !nav.parentId)
                .map((nav, nIdx) => (
                  <a
                    key={nav.id || nIdx}
                    href={nav.url || '#'}
                    target={nav.isExternal ? '_blank' : undefined}
                    rel={nav.isExternal ? 'noopener noreferrer' : undefined}
                    className="text-xs sm:text-[13px] font-medium tracking-tight text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    {nav.label}
                  </a>
                ))}
          </div>
        </nav>
      )}

      {/* ── 2. FLOU PROGRESSIF DISCRET SOUS L'EN-TÊTE (z-20) ── */}
      {showProgressiveBlur && (
        <ProgressiveBlur
          direction="top"
          className="h-16 sm:h-20 fixed top-0 left-0 right-0 z-20 pointer-events-none"
        />
      )}

      {/* ── 3. CONTENU PRINCIPAL DE L'ARTICLE (z-10) ── */}
      <main
        className={cn(
          'relative z-10 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          isSidebarOpen ? 'sm:translate-x-[240px] md:translate-x-[280px]' : 'translate-x-0'
        )}
      >
        {activeCategory && !isArticleMode && (
          <div className="container mx-auto px-4 sm:px-6 max-w-4xl pt-2 pb-4">
            <div className="flex items-center justify-between border-b border-border/30 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rubrique :
                </span>
                <span className="text-xs sm:text-sm font-bold text-foreground">
                  {activeCategory.name}
                </span>
                {activeCategory.parentId && (
                  <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded">
                    sous-rubrique
                  </span>
                )}
              </div>
              <a
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 font-medium group"
                title="Afficher tous les articles"
              >
                <span className="group-hover:underline">✕ Voir tous les articles</span>
              </a>
            </div>
          </div>
        )}
        {children}
      </main>

      {/* ── 4. RÉGLETTE LATÉRALE EXACTE DEVOURING DETAILS ── */}
      {showCraftIndex && (
        <CraftSidebarDrawer
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
          publication={publication}
          items={drawerItems}
          activeId={article?.id}
          indicatorColor={accentColor}
          side="left"
        />
      )}

      {/* ── 5. DOCK FLOTTANT INFÉRIEUR ARRONDI ── */}
      {showCraftIndex && (
        <MinimalDock
          mode={isArticleMode ? 'article' : 'home'}
          articleTitle={article?.title}
          itemsCount={drawerItems.length}
          readingTimeMinutes={article?.readingTime || 4}
          indicatorColor={accentColor}
          isDrawerOpen={isSidebarOpen}
          onToggleDrawer={() => setIsSidebarOpen((prev) => !prev)}
          supportUrl={publication.supportUrl}
        />
      )}
    </div>
  );
}
