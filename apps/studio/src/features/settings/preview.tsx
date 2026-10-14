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
  sans: "var(--font-sans, 'Inter', sans-serif)",
  outfit: "var(--font-outfit, 'Outfit', sans-serif)",
  'space-grotesk': "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
  serif: "var(--font-serif, 'Newsreader', 'Playfair Display', Georgia, serif)",
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

        {/* ── 4. CONTENU DE LECTURE MINIMAL CRAFT (Dense, enrichi, sans numérotation 01/02) ── */}
        <div className="relative z-10 px-6 sm:px-10 pt-6 pb-20 max-w-2xl mx-auto space-y-8">
          {/* En-tête / Manifeste */}
          <div className="space-y-4">
            <h1
              style={{ fontFamily: activeFont }}
              className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug"
            >
              {displayName}
            </h1>
            {showTagline && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-lg">
                {displayHero}
              </p>
            )}

            {/* Formulaire d'abonnement épuré en en-tête */}
            {showSubscribeButton && (
              <div className="pt-3 max-w-md">
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    readOnly
                    placeholder="Entrez votre email..."
                    className="flex-1 h-9 px-3 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 shadow-2xs"
                  />
                  <span
                    className="h-9 px-4 rounded-lg text-xs font-semibold text-white shadow-2xs flex items-center justify-center shrink-0 cursor-default"
                    style={{ backgroundColor: activeColor }}
                  >
                    S’abonner
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  Rejoignez les lecteurs de {displayName}. Désinscription en un clic.
                </p>
              </div>
            )}
          </div>

          {/* Filtres de rubriques / Catégories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar border-t border-border/30">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-foreground/10 text-foreground shrink-0 shadow-2xs cursor-default">
              Tous
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/40 border border-border/40 shrink-0 cursor-default">
              Interactions <span className="text-[9px] opacity-60 ml-0.5">3</span>
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/40 border border-border/40 shrink-0 cursor-default">
              Systèmes <span className="text-[9px] opacity-60 ml-0.5">2</span>
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/40 border border-border/40 shrink-0 cursor-default">
              Éditorial <span className="text-[9px] opacity-60 ml-0.5">1</span>
            </span>
          </div>

          {/* Flux d'articles dense & soigné */}
          <div className="space-y-4">
            {/* Article Vedette */}
            <article className="group p-5 rounded-xl border border-border/50 bg-card hover:border-border/90 transition-all space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span
                  className="px-2 py-0.5 rounded-full font-semibold text-[10px]"
                  style={{ backgroundColor: `${activeColor}18`, color: activeColor }}
                >
                  Interactions
                </span>
                <span>·</span>
                <span>6 min de lecture</span>
                <span>·</span>
                <span>15 mars 2026</span>
              </div>
              <h2
                style={{ fontFamily: activeFont }}
                className="text-base sm:text-lg font-bold text-foreground leading-snug tracking-tight"
              >
                Modèles cinétiques et toucher tactile des surfaces fluides
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                Exploration des constantes d'élasticité, d'amortissement et de vélocité pour
                conférer un momentum organique aux interfaces modernes.
              </p>
            </article>

            {/* Grille secondaire 2 colonnes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <article className="p-4 rounded-xl border border-border/40 bg-card space-y-2 shadow-2xs">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="px-1.5 py-0.2 rounded bg-muted/50 font-medium text-[10px]">
                    Systèmes
                  </span>
                  <span>·</span>
                  <span>4 min</span>
                </div>
                <h3
                  style={{ fontFamily: activeFont }}
                  className="text-xs sm:text-sm font-semibold text-foreground leading-snug"
                >
                  L'indépendance éditoriale à l'ère des flux
                </h3>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  Pourquoi les créateurs reprennent la souveraineté de leur lectorat.
                </p>
              </article>

              <article className="p-4 rounded-xl border border-border/40 bg-card space-y-2 shadow-2xs">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="px-1.5 py-0.2 rounded bg-muted/50 font-medium text-[10px]">
                    Éditorial
                  </span>
                  <span>·</span>
                  <span>3 min</span>
                </div>
                <h3
                  style={{ fontFamily: activeFont }}
                  className="text-xs sm:text-sm font-semibold text-foreground leading-snug"
                >
                  Le temps long comme méthode de travail
                </h3>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                  S'affranchir du bruit permanent pour retrouver la profondeur des idées.
                </p>
              </article>
            </div>
          </div>

          {/* Mur d'abonnement Newsletter (Style fidèle à SubscribeForm & NewsletterWallBlock) */}
          {showNewsletterWall && (
            <div className="p-6 rounded-2xl border border-border/50 bg-muted/20 text-center space-y-3 shadow-xs">
              <div className="space-y-1">
                <h3
                  style={{ fontFamily: activeFont }}
                  className="text-sm sm:text-base font-bold text-foreground"
                >
                  Rester en contact
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Mes réflexions directement dans votre boîte mail, sans algorithme ni spam.
                </p>
              </div>

              {/* Formulaire moderne avec bouton accent */}
              <div className="flex flex-col sm:flex-row items-center gap-2 max-w-md mx-auto pt-1">
                <input
                  type="email"
                  readOnly
                  placeholder="votre.email@domaine.com"
                  className="w-full sm:flex-1 h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none shadow-2xs"
                />
                <span
                  className="w-full sm:w-auto h-9 px-4 rounded-lg text-xs font-semibold text-white shadow-2xs flex items-center justify-center whitespace-nowrap cursor-default"
                  style={{ backgroundColor: activeColor }}
                >
                  S'abonner
                </span>
              </div>

              <p className="text-[10px] text-muted-foreground/70">
                100% Indépendant · 1-clic pour les membres Qoefi · Désinscription libre
              </p>
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
