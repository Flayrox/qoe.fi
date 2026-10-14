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

import React, { useState } from 'react';
import { ChevronDown, Folder, Heart, X, ArrowLeft } from 'lucide-react';
import { cn } from '@qoe/utils';
import { ProgressiveBlur } from '../../../ui/progressive-blur';
import {
  CraftSidebarDrawer,
  SidebarToggleIcon,
  type CraftDrawerItem,
} from '../../../ui/craft-sidebar-drawer';
import { MinimalDock } from './MinimalDock';
import type { TemplatePublicationContext, TemplateArticleItem } from '../../schema';
import { SocialIcon } from '../../../SocialIcon';

export interface MinimalCraftShellProps {
  publication: TemplatePublicationContext;
  article?: TemplateArticleItem | null;
  articles?: TemplateArticleItem[];
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MinimalCraftShell({
  publication,
  article,
  articles = [],
  children,
  className = '',
  style,
}: MinimalCraftShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [activeDropdownCatId, setActiveDropdownCatId] = useState<string | null>(null);

  const accentColor = publication.accentColor || '#F97316';
  const displayName =
    publication.name || publication.domain || publication.subdomain || 'Mon Carnet';
  const siteOptions = publication.siteOptions ?? {};

  const showCraftIndex = (siteOptions.showCraftIndex ?? true) !== false;
  const showProgressiveBlur = (siteOptions.showProgressiveBlur ?? true) !== false;
  const showBanner = (siteOptions.showBanner ?? true) !== false;
  const headerWordmarkUrl = showBanner ? publication.headerImageUrl || null : null;
  const isLogoSquare = siteOptions.logoShape === 'square' || Boolean(siteOptions.logoShapeSquare);
  const showLogo = (siteOptions.showLogo ?? true) !== false;
  const showCategoryTabs = (siteOptions.showCategoryTabs ?? true) !== false;

  const categories = publication.categories || [];
  const rootCategories = categories.filter((c) => !c.parentId);
  const getSubcategories = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const isArticleMode = Boolean(article);
  const currentSectionTitle = isArticleMode ? article?.title || 'Article' : 'Sommaire';

  // Préparation des items pour la réglette Devouring Details
  const articleDrawerItems: CraftDrawerItem[] = articles.map((art, idx) => {
    const artSlug = art.slug || art.id;
    const catSlug = art.category?.slug;
    const href = catSlug ? `/${catSlug}/${artSlug}` : `/article/${artSlug}`;

    return {
      id: art.id,
      label: art.title,
      number: String(idx + 1).padStart(2, '0'),
      href,
      category: art.category?.name || 'Articles',
      isActive: article?.id === art.id,
    };
  });

  const drawerItems: CraftDrawerItem[] = [
    {
      id: 'home',
      label: 'Accueil',
      number: '00',
      href: '/',
      category: 'Navigation',
      isActive: !isArticleMode,
    },
    ...articleDrawerItems,
  ];

  const hasCategoryBar =
    showCategoryTabs &&
    (rootCategories.length > 0 || (publication.navigation && publication.navigation.length > 0));

  return (
    <div
      style={style}
      data-sidebar-open={isSidebarOpen ? 'true' : 'false'}
      className={cn(
        'platform_root min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white pb-32 relative',
        hasCategoryBar ? 'pt-28 sm:pt-40' : 'pt-24 sm:pt-36',
        className
      )}
    >
      {/* ── 1. EN-TÊTE FIXE SUPÉRIEUR DEVOURING DETAILS (top-8 sm:top-12 z-40) ── */}
      <header
        data-header="true"
        className="platform_header fixed top-6 sm:top-10 left-6 right-6 z-40 flex items-center justify-between select-none pointer-events-auto text-muted-foreground"
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

        {/* Centre : Titre de la page choisie (ou Wordmark / Logo d'en-tête si présent) */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto max-w-[70vw] sm:max-w-lg text-center">
          {!isArticleMode && headerWordmarkUrl ? (
            <a
              href="/"
              className="inline-flex items-center justify-center transition-transform hover:scale-[1.02]"
            >
              <img
                src={headerWordmarkUrl}
                alt={displayName}
                className="h-6 sm:h-7 md:h-8 w-auto max-w-[200px] sm:max-w-[280px] object-contain mx-auto"
              />
            </a>
          ) : (
            <p
              data-breadcrumb="true"
              aria-label="Titre de la page"
              className="text-base sm:text-lg md:text-xl font-semibold tracking-tight text-foreground truncate"
            >
              {isArticleMode ? currentSectionTitle : displayName}
            </p>
          )}
        </div>

        {/* Pastille de marque avec menu déroulant réglages / profil */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsSettingsMenuOpen((prev) => !prev)}
            className="platform_settings ml-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground rounded-full outline-offset-2 cursor-pointer p-1 transition-colors"
            aria-label="Menu du carnet"
            title="Profil & Options"
          >
            <span
              role="img"
              aria-label="Logomark"
              className="block rounded-full shadow-2xs transition-transform hover:scale-110"
              style={{
                width: 16,
                height: 16,
                backgroundColor: accentColor,
              }}
            />
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {/* Menu popover épuré Radix-style */}
          {isSettingsMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsSettingsMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between pb-3 border-b border-border/40">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {displayName}
                    </h4>
                    {publication.domain && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {publication.domain}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsMenuOpen(false)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {publication.heroText && (
                  <p className="text-xs text-muted-foreground leading-relaxed py-3 border-b border-border/40">
                    {publication.heroText}
                  </p>
                )}

                {/* Rubriques */}
                {publication.categories && publication.categories.length > 0 && (
                  <div className="py-2.5 border-b border-border/40 space-y-1.5">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 tracking-wider">
                      Rubriques
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {publication.categories.map((cat) => (
                        <a
                          key={cat.id}
                          href={`/${cat.slug}`}
                          className="px-2 py-0.5 rounded text-[11px] border border-border/40 bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <Folder className="w-2.5 h-2.5 opacity-60" />
                          <span>{cat.name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Réseaux sociaux */}
                {publication.socialLinks && publication.socialLinks.length > 0 && (
                  <div className="pt-2.5 flex items-center gap-2 flex-wrap">
                    {publication.socialLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md border border-border/40 bg-muted/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={link.platform}
                      >
                        <SocialIcon platform={link.platform} className="w-3.5 h-3.5" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Lien de soutien si configuré */}
                {publication.stripeAccountId && (
                  <div className="pt-3">
                    <a
                      href="/support"
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-white shadow-2xs"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      <span>Soutenir l'auteur</span>
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── 1.5. BARRE D'ONGLETS / RUBRIQUES & SOUS-RUBRIQUES (Translucide & Glassmorphic) ── */}
      {hasCategoryBar && (
        <nav
          aria-label="Navigation des rubriques"
          className="fixed top-16 sm:top-20 left-0 right-0 z-35 flex justify-center pointer-events-none px-4"
        >
          <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-background/60 backdrop-blur-2xl border border-border/40 shadow-xs max-w-[94vw] overflow-x-auto no-scrollbar">
            {/* Onglet Tous les articles / Accueil */}
            <a
              href="/"
              className={cn(
                'text-xs font-medium px-3 py-1 rounded-full transition-all shrink-0 select-none',
                !isArticleMode && !article?.category?.slug
                  ? 'bg-foreground/10 text-foreground font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Accueil
            </a>

            {/* Rubriques principales et leurs sous-catégories */}
            {rootCategories.map((cat) => {
              const subs = getSubcategories(cat.id);
              const hasSubs = subs.length > 0;
              const isCatActive = article?.category?.slug === cat.slug;
              const isDropdownOpen = activeDropdownCatId === cat.id;

              if (!hasSubs) {
                return (
                  <a
                    key={cat.id}
                    href={`/${cat.slug}`}
                    className={cn(
                      'text-xs font-medium px-3 py-1 rounded-full transition-all shrink-0 select-none',
                      isCatActive
                        ? 'bg-foreground/10 text-foreground font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
                      'flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full transition-all select-none cursor-pointer',
                      isCatActive || isDropdownOpen
                        ? 'bg-foreground/10 text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
                      <div className="absolute left-0 top-full mt-2 min-w-[170px] rounded-2xl border border-border/50 bg-background/90 backdrop-blur-2xl p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5">
                        <a
                          href={`/${cat.slug}`}
                          onClick={() => setActiveDropdownCatId(null)}
                          className="flex items-center justify-between px-3 py-1.5 text-xs font-medium rounded-lg text-foreground hover:bg-muted/70 transition-colors"
                        >
                          <span>Tout voir dans {cat.name}</span>
                        </a>
                        <div className="h-px bg-border/40 my-1" />
                        {subs.map((sub) => (
                          <a
                            key={sub.id}
                            href={`/${sub.slug}`}
                            onClick={() => setActiveDropdownCatId(null)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-lg transition-colors"
                          >
                            <span className="opacity-40 font-mono text-[10px]">↳</span>
                            <span>{sub.name}</span>
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Liens de navigation additionnels si configurés */}
            {publication.navigation &&
              publication.navigation
                .filter((nav) => !nav.parentId)
                .map((nav, nIdx) => (
                  <a
                    key={nav.id || nIdx}
                    href={nav.url || '#'}
                    target={nav.isExternal ? '_blank' : undefined}
                    rel={nav.isExternal ? 'noopener noreferrer' : undefined}
                    className="text-xs font-medium px-3 py-1 rounded-full transition-all shrink-0 select-none text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  >
                    {nav.label}
                  </a>
                ))}
          </div>
        </nav>
      )}

      {/* ── 2. FLOU PROGRESSIF DEVOURING DETAILS (z-20, passe SOUS l'en-tête z-40) ── */}
      {showProgressiveBlur && (
        <>
          <ProgressiveBlur
            direction="top"
            className="h-28 sm:h-32 fixed top-0 left-0 right-0 z-20 pointer-events-none"
          />
          <ProgressiveBlur
            direction="bottom"
            className="h-28 sm:h-32 fixed bottom-0 left-0 right-0 z-20 pointer-events-none"
          />
        </>
      )}

      {/* ── 3. CONTENU PRINCIPAL DE L'ARTICLE (z-10) ── */}
      <main
        className={cn(
          'relative z-10 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          isSidebarOpen ? 'sm:translate-x-[240px] md:translate-x-[280px]' : 'translate-x-0'
        )}
      >
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
