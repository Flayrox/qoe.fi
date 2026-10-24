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

import React, { useState, useEffect, useContext } from 'react';
import { ChevronDown, ArrowLeft, Search, Share2, Check } from 'lucide-react';
import { cn } from '@qoe/utils';
import { ProgressiveBlur } from '../../../ui/progressive-blur';
import {
  CraftSidebarDrawer,
  SidebarToggleIcon,
  type CraftDrawerItem,
} from '../../../ui/craft-sidebar-drawer';
import { MinimalDock } from './MinimalDock';
import { SafeAvatar } from '../../../SafeAvatar';
import type { TemplatePublicationContext, TemplateArticleItem } from '../../schema';
import { AuthModalContext } from '../../../auth/AuthModalContext';
import { resolveTenantNavigation } from '../../navigation';
import { ExitInterstitialProvider, ExternalLinkInterceptor } from '../../../ui/exit-interstitial';

export interface MinimalCraftShellProps {
  publication: TemplatePublicationContext;
  article?: TemplateArticleItem | null;
  articles?: TemplateArticleItem[];
  activeCategory?: import('../../schema').TemplateCategoryItem | null;
  currentPath?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MinimalCraftShell({
  publication,
  article,
  articles = [],
  activeCategory: propActiveCategory,
  currentPath: propCurrentPath,
  children,
  className = '',
  style,
}: MinimalCraftShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeDropdownCatId, setActiveDropdownCatId] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [currentPath, setCurrentPath] = useState(propCurrentPath || '');

  useEffect(() => {
    if (propCurrentPath) {
      setCurrentPath(propCurrentPath);
    } else if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, [propCurrentPath]);

  const authContext = useContext(AuthModalContext);

  const accentColor = publication.accentColor || '#F97316';
  const displayName =
    publication.name || publication.domain || publication.subdomain || 'Mon Carnet';
  const siteOptions = publication.siteOptions ?? {};

  // 📌 Sidebar mise de côté pour notre to-do future : désactivée par défaut
  const showCraftIndex = Boolean(siteOptions.showCraftIndex);
  const showProgressiveBlur = (siteOptions.showProgressiveBlur ?? true) !== false;
  // Wordmark : logo typographique dédié (image), centré dans l'en-tête
  const wordmarkUrl =
    typeof siteOptions.wordmarkUrl === 'string' && siteOptions.wordmarkUrl.trim().length > 0
      ? siteOptions.wordmarkUrl
      : null;
  const isLogoSquare = siteOptions.logoShape === 'square' || Boolean(siteOptions.logoShapeSquare);
  const showLogo = (siteOptions.showLogo ?? true) !== false;
  const showCategoryTabs = (siteOptions.showCategoryTabs ?? true) !== false;

  // Résolution souveraine et unifiée de la navigation (rubriques + liens externes + pages)
  const { navItems } = resolveTenantNavigation({
    categories: publication.categories,
    navigation: publication.navigation,
    siteOptions,
    publicationId: publication.id,
    includePages: true,
  });

  const activeCategory = propActiveCategory || publication.activeCategory || null;
  const activeCategorySlug = activeCategory?.slug || article?.category?.slug || null;
  const activeCategoryParent =
    activeCategory?.parentId && publication.categories
      ? (publication.categories.find((c) => c.id === activeCategory.parentId) ?? null)
      : null;
  const activeCategoryChildren =
    activeCategory && publication.categories
      ? publication.categories.filter((c) => c.parentId === activeCategory.id)
      : [];

  const isArticleMode = Boolean(article);

  // Préparation des items pour la réglette Devouring Details
  const articleDrawerItems: CraftDrawerItem[] = articles.map((art) => {
    const artSlug = art.slug || art.id;
    const catSlug = art.category?.slug;
    const href = catSlug ? `/${catSlug}/${artSlug}` : `/uncategorized/${artSlug}`;

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

  const isAboutActive = currentPath === '/about' || currentPath.startsWith('/about/');
  const isThoughtsActive = currentPath === '/thoughts' || currentPath.startsWith('/thoughts/');
  const isHomeActive =
    !isArticleMode &&
    !activeCategorySlug &&
    !isAboutActive &&
    !isThoughtsActive &&
    (currentPath === '/' || currentPath === '');

  const hasCategoryBar = showCategoryTabs && navItems.length > 0;

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
    <ExitInterstitialProvider sourceName={displayName}>
      <ExternalLinkInterceptor sourceName={displayName}>
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
            className="platform_header fixed top-5 sm:top-7 left-6 right-6 z-40 flex items-center justify-between select-none pointer-events-auto text-muted-foreground"
          >
            {/* Côté Gauche : Logo classique + Contrôles de navigation (Sidebar + Retour si mode article) */}
            <div className="flex items-center gap-2.5 shrink-0 z-10 min-w-0">
              {/* Marque : logo configuré dans les réglages, sinon l'avatar de la
              personne, sinon l'avatar de repli déterministe (jamais une lettre
              générique). */}
              {showLogo && (
                <a
                  href="/"
                  className="inline-flex items-center justify-center shrink-0 transition-transform hover:scale-105"
                  title={displayName}
                >
                  <SafeAvatar
                    src={publication.logoUrl || publication.author?.avatarUrl || null}
                    name={publication.author?.name || displayName}
                    username={publication.author?.username || publication.subdomain}
                    size={42}
                    shape={isLogoSquare ? 'squircle' : 'circle'}
                    className="border border-border/50 shadow-2xs"
                  />
                </a>
              )}

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

            {/* Centre : Wordmark typographique dédié ou Nom de la publication */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center max-w-[42vw] sm:max-w-[48vw] text-center z-10 pointer-events-auto">
              <a
                href="/"
                className="min-w-0 transition-opacity hover:opacity-85 inline-flex items-center justify-center max-w-full"
                title={displayName}
              >
                {wordmarkUrl ? (
                  <img
                    src={wordmarkUrl}
                    alt={displayName}
                    className="h-7 sm:h-8 md:h-9 w-auto max-w-full object-contain object-center"
                  />
                ) : (
                  <p
                    data-breadcrumb="true"
                    aria-label="Nom de la publication"
                    className="truncate text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground text-center"
                  >
                    {displayName}
                  </p>
                )}
              </a>
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
                className="hidden sm:inline-flex p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
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
                      authContext.openAuthModal({ mode: 'signup', actionContext: 'follow' });
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
              className="fixed top-[4.25rem] sm:top-[4.75rem] left-0 right-0 z-35 flex justify-center pointer-events-none px-4"
            >
              <div className="pointer-events-auto flex items-center justify-center gap-4 sm:gap-6 max-w-[94vw] flex-wrap select-none">
                {navItems.map((item) => {
                  const hasSubs = item.children && item.children.length > 0;
                  const isHome = item.id === 'home' || item.url === '/';
                  const isAbout = item.id === 'page:about' || item.url === '/about';
                  const isThoughts = item.id === 'page:thoughts' || item.url === '/thoughts';
                  const isCat = item.isCategory;
                  const isMail = item.isMail || item.url.startsWith('mailto:');
                  const isExt = item.isExternal && !isMail;

                  const isCatActive =
                    isCat &&
                    (activeCategorySlug === item.categorySlug ||
                      Boolean(item.children?.some((s) => s.categorySlug === activeCategorySlug)));
                  const isActive = isHome
                    ? isHomeActive
                    : isAbout
                      ? isAboutActive
                      : isThoughts
                        ? isThoughtsActive
                        : isCat
                          ? isCatActive
                          : !isExt && !isMail && currentPath === item.url;

                  const isDropdownOpen = activeDropdownCatId === item.id;

                  if (!hasSubs) {
                    const targetHref = isExt
                      ? `/exit?url=${encodeURIComponent(item.url)}`
                      : item.url;
                    return (
                      <a
                        key={item.id}
                        href={targetHref}
                        target={isExt ? '_blank' : undefined}
                        rel={isExt ? 'noopener noreferrer' : undefined}
                        className={cn(
                          'text-xs sm:text-[13px] font-medium tracking-tight transition-colors shrink-0',
                          isActive
                            ? 'text-foreground font-semibold underline underline-offset-4 decoration-2 decoration-[var(--tenant-accent)]'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {item.label}
                      </a>
                    );
                  }

                  return (
                    <div key={item.id} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveDropdownCatId(isDropdownOpen ? null : item.id)}
                        className={cn(
                          'flex items-center gap-1 text-xs sm:text-[13px] font-medium tracking-tight transition-colors select-none cursor-pointer',
                          isActive
                            ? 'text-foreground font-semibold underline underline-offset-4 decoration-2 decoration-[var(--tenant-accent)]'
                            : isDropdownOpen
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <span>{item.label}</span>
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
                              href={item.url}
                              onClick={() => setActiveDropdownCatId(null)}
                              className={cn(
                                'flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                                activeCategorySlug === item.categorySlug
                                  ? 'bg-muted text-foreground font-semibold'
                                  : 'text-foreground hover:bg-muted/70'
                              )}
                            >
                              <span>Tout voir dans {item.label}</span>
                            </a>
                            <div className="h-px bg-border/40 my-1" />
                            {item.children?.map((sub) => (
                              <a
                                key={sub.id}
                                href={sub.url}
                                onClick={() => setActiveDropdownCatId(null)}
                                className={cn(
                                  'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
                                  activeCategorySlug === sub.categorySlug
                                    ? 'bg-muted text-foreground font-semibold'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                                )}
                              >
                                <span className="opacity-40 font-sans text-[10px]">↳</span>
                                <span>{sub.label}</span>
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
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
              <div className="container mx-auto px-4 sm:px-6 max-w-4xl pt-3 pb-5">
                <div className="border-b border-border/30 pb-4">
                  <nav
                    aria-label="Fil d’Ariane"
                    className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground flex-wrap"
                  >
                    <a href="/" className="hover:text-foreground transition-colors">
                      Accueil
                    </a>
                    {activeCategoryParent && (
                      <>
                        <span aria-hidden="true" className="opacity-50">
                          /
                        </span>
                        <a
                          href={`/${activeCategoryParent.slug}`}
                          className="hover:text-foreground transition-colors"
                        >
                          {activeCategoryParent.name}
                        </a>
                      </>
                    )}
                    <span aria-hidden="true" className="opacity-50">
                      /
                    </span>
                    <span aria-current="page" className="text-foreground font-semibold">
                      {activeCategory.name}
                    </span>
                  </nav>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                    <div className="min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                        {activeCategory.name}
                      </h1>
                      {activeCategory.description && (
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                          {activeCategory.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
                      {articles.length} article{articles.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {activeCategoryChildren.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2" aria-label="Sous-catégories">
                      {activeCategoryChildren.map((sub) => (
                        <a
                          key={sub.id}
                          href={`/${sub.slug}`}
                          className="px-3 py-1.5 rounded-full border border-border/50 bg-muted/20 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          {sub.name}
                        </a>
                      ))}
                    </div>
                  )}
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
      </ExternalLinkInterceptor>
    </ExitInterstitialProvider>
  );
}
