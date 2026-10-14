'use client';

// =====================================================================
// 🌐 apps/studio/src/features/settings/preview.tsx
// =====================================================================
// Aperçu en direct du site web public.
// Rendu direct et épuré : zéro barre macos, zéro fausse URL de navigateur.
// =====================================================================

import React from 'react';
import Image from 'next/image';
import { SidebarToggleIcon } from '@qoe/ui';
import type { ClientNavigationItem, ClientSocialLink } from './types';

export interface SiteOptions {
  showBanner?: boolean;
  showLogo?: boolean;
  showTagline?: boolean;
  showSubscribeButton?: boolean;
  showSocialLinks?: boolean;
  showCraftIndex?: boolean;
  showProgressiveBlur?: boolean;
  showNewsletterWall?: boolean;
}

export interface PreviewProps {
  name: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  layoutStyle?: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  subdomain?: string | null;
  username?: string | null;
  navigation?: ClientNavigationItem[];
  socialLinks?: ClientSocialLink[];
  siteOptions?: SiteOptions;
}

const FONT_FAMILIES: Record<string, string> = {
  sans: "'Inter', sans-serif",
  outfit: "'Outfit', sans-serif",
  'space-grotesk': "'Space Grotesk', sans-serif",
  serif: "'Playfair Display', serif",
};

export function Preview({
  name,
  heroText,
  accentColor,
  fontFamily,
  logoUrl,
  headerImageUrl,
  navigation: _navigation = [],
  socialLinks: _socialLinks = [],
  siteOptions = {},
}: PreviewProps) {
  const activeFont = FONT_FAMILIES[fontFamily || 'sans'] || "'Inter', sans-serif";
  const activeColor = accentColor || '#EE4B2B';
  const displayName = name?.trim() || 'Mon Site Web';
  const displayHero =
    heroText?.trim() ||
    "Un espace dédié aux écrits de fond, aux analyses indépendantes et au partage d'idées.";

  const {
    showBanner = true,
    showLogo = true,
    showTagline = true,
    showSubscribeButton = true,
    showSocialLinks: _showSocialLinks = true,
    showCraftIndex = true,
    showProgressiveBlur = true,
    showNewsletterWall = true,
  } = siteOptions;

  return (
    <div className="rounded-2xl border border-border/70 bg-background overflow-hidden shadow-xs transition-all select-none">
      <div className="w-full relative overflow-hidden flex flex-col justify-between min-h-[560px]">
        {/* ── 1. EN-TÊTE FIXE AU-DESSUS DU DÉGRADÉ (z-30) ── */}
        <header className="px-5 py-3.5 flex items-center justify-between gap-3 relative z-30 bg-background/95 backdrop-blur-md border-b border-border/20">
          <div className="flex items-center gap-2.5 min-w-0">
            {showCraftIndex && (
              <div
                className="p-1 rounded-md border border-border/50 bg-background text-muted-foreground shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                title="Sidebar Devouring Details"
              >
                <SidebarToggleIcon isOpen={false} size={14} />
              </div>
            )}

            {showLogo && (
              <div
                className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-white shadow-2xs"
                style={{ backgroundColor: activeColor }}
              >
                {logoUrl ? (
                  <Image src={logoUrl} alt="" width={20} height={20} className="object-cover" />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs truncate">
              <span
                style={{ fontFamily: activeFont }}
                className="font-bold text-foreground truncate tracking-tight"
              >
                {displayName}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground truncate text-[11px]">Index</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showSubscribeButton && (
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-2xs"
                style={{ backgroundColor: activeColor }}
              >
                S'abonner
              </span>
            )}
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: activeColor }}
              title={`Accent: ${activeColor}`}
            />
          </div>
        </header>

        {/* ── 2. FLOU PROGRESSIF SUPÉRIEUR (z-20, passe SOUS le header) ── */}
        {showProgressiveBlur && (
          <div className="absolute top-[48px] left-0 right-0 h-14 pointer-events-none z-20 bg-gradient-to-b from-background via-background/70 to-transparent" />
        )}

        {/* ── 3. COLONNE DE TIRETS GRADUÉS GAUCHE (Ticks Devouring Details) ── */}
        {showCraftIndex && (
          <div className="absolute left-4 top-24 bottom-24 w-10 flex flex-col justify-center gap-2 pointer-events-none z-10 opacity-75">
            {/* Chapitre 1 Actif */}
            <div className="flex items-center gap-2">
              <span
                className="h-[1.5px] w-9 rounded-full transition-all"
                style={{ backgroundColor: activeColor }}
              />
            </div>
            {/* Tirets intercalaires */}
            <span className="h-[1px] w-3 rounded-full bg-border/60" />
            <span className="h-[1px] w-3 rounded-full bg-border/60" />

            {/* Chapitre 2 Inactif */}
            <div className="flex items-center gap-2">
              <span className="h-[1px] w-5 rounded-full bg-foreground/40" />
            </div>
            {/* Tirets intercalaires */}
            <span className="h-[1px] w-3 rounded-full bg-border/60" />
            <span className="h-[1px] w-3 rounded-full bg-border/60" />

            {/* Chapitre 3 Inactif */}
            <div className="flex items-center gap-2">
              <span className="h-[1px] w-5 rounded-full bg-foreground/40" />
            </div>
          </div>
        )}

        {/* ── 4. CONTENU FACTICE DE LECTURE (Style suisse épuré) ── */}
        <div className="relative z-10 px-6 sm:px-12 pt-6 pb-20 max-w-xl mx-auto space-y-8">
          {/* Section 01 : Intro */}
          <div className="relative space-y-3">
            <div
              className="w-3 h-3 rounded-full absolute -left-5 top-1.5 shadow-2xs"
              style={{ backgroundColor: activeColor }}
              aria-hidden="true"
            />
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>№ 01</span>
              <span>·</span>
              <span>Introduction</span>
            </div>
            <h1
              style={{ fontFamily: activeFont }}
              className="text-lg sm:text-xl font-bold text-foreground tracking-tight leading-snug"
            >
              {displayName}
            </h1>
            {showTagline && (
              <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">
                {displayHero}
              </p>
            )}
          </div>

          {/* Bleed Mockup Media Factice */}
          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden space-y-2 p-1 shadow-2xs">
            <div className="aspect-16/9 rounded-lg bg-muted/40 flex items-center justify-center relative overflow-hidden">
              {headerImageUrl && showBanner ? (
                <Image src={headerImageUrl} alt="" fill className="object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground/60">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shadow-2xs text-white text-[10px]"
                    style={{ backgroundColor: activeColor }}
                  >
                    ▶
                  </div>
                  <span className="text-[10px] text-muted-foreground/80">
                    Espace visuel & prototypes
                  </span>
                </div>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground/70 py-1">
              Mise en page épurée axée sur le confort de lecture et l'indépendance éditoriale.
            </p>
          </div>

          {/* Section 02 Factice */}
          <div className="space-y-2 border-t border-border/30 pt-6">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>№ 02</span>
              <span>·</span>
              <span>Réflexion éditoriale</span>
            </div>
            <h2
              style={{ fontFamily: activeFont }}
              className="text-sm sm:text-base font-bold text-foreground tracking-tight"
            >
              L'art de la sobriété et de l'indépendance numérique
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              Retrouver la profondeur d'écriture et le temps long de la réflexion sans
              intermédiaires.
            </p>
          </div>

          {/* Newsletter Wall Factice */}
          {showNewsletterWall && (
            <div className="p-4 rounded-xl border border-border/40 bg-muted/15 text-center space-y-2">
              <p className="text-xs font-semibold text-foreground">
                Recevoir les prochains chapitres
              </p>
              <div className="flex items-center gap-2 max-w-xs mx-auto">
                <input
                  type="email"
                  readOnly
                  placeholder="email@exemple.com"
                  className="w-full px-2.5 py-1 bg-background border border-border/40 rounded-md text-[11px] text-muted-foreground"
                />
                <button
                  type="button"
                  className="px-3 py-1 rounded-md text-[11px] font-semibold text-white shrink-0 shadow-2xs"
                  style={{ backgroundColor: activeColor }}
                >
                  Suivre
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 5. FLOU PROGRESSIF INFÉRIEUR (z-20) ── */}
        {showProgressiveBlur && (
          <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-20 bg-gradient-to-t from-background via-background/70 to-transparent" />
        )}

        {/* ── 6. DOCK FLOTTANT PILL DEVOURING DETAILS (z-30) ── */}
        {showCraftIndex && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-border/80 bg-background/95 backdrop-blur-md shadow-lg">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: activeColor }}
              />
              <span className="text-[11px] font-medium text-foreground tracking-tight">
                {displayName}
              </span>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <span className="text-[10px] text-muted-foreground">Index</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compat export
export { Preview as PublicationLivePreview };
