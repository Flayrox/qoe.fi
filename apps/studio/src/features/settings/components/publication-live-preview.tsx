'use client';

// =====================================================================
// 🌐 PublicationLivePreview — Aperçu Fidèle de la Publication
// =====================================================================
// Rendu réel et immersif du site web public.
// Zéro chrome macOS / faux navigateur. Direct et épuré.
// =====================================================================

import React from 'react';
import Image from 'next/image';
import type { ClientNavigationItem, ClientSocialLink } from './publication-settings';

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

export interface PublicationLivePreviewProps {
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

export function PublicationLivePreview({
  name,
  heroText,
  accentColor,
  fontFamily,
  logoUrl,
  headerImageUrl,
  navigation = [],
  socialLinks = [],
  siteOptions = {},
}: PublicationLivePreviewProps) {
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
    showSocialLinks = true,
    showCraftIndex = true,
    showProgressiveBlur = true,
    showNewsletterWall = true,
  } = siteOptions;

  return (
    <div className="rounded-2xl border border-border/70 bg-background overflow-hidden shadow-xs transition-all select-none">
      <div className="w-full relative overflow-hidden flex flex-col justify-between min-h-[520px]">
        {/* Flou progressif supérieur */}
        {showProgressiveBlur && (
          <div className="absolute top-0 left-0 right-0 h-10 pointer-events-none z-20 bg-gradient-to-b from-background via-background/60 to-transparent" />
        )}

        {/* Sommaire Craft discret (Devouring Details) */}
        {showCraftIndex && (
          <div className="absolute left-3 top-36 bottom-24 w-8 flex flex-col justify-center gap-2 pointer-events-none z-10 opacity-70">
            <span
              className="h-[1.5px] w-6 rounded-full transition-all"
              style={{ backgroundColor: activeColor }}
            />
            <span className="h-[1px] w-3 rounded-full bg-border" />
            <span className="h-[1px] w-3 rounded-full bg-border" />
            <span className="h-[1px] w-4 rounded-full bg-foreground/40" />
            <span className="h-[1px] w-3 rounded-full bg-border" />
            <span className="h-[1px] w-3 rounded-full bg-border" />
            <span className="h-[1px] w-4 rounded-full bg-foreground/40" />
          </div>
        )}

        <div className="relative z-10">
          {/* Bannière de couverture 21:9 */}
          {showBanner && (
            <div className="w-full aspect-21/9 bg-muted/30 border-b border-border/30 overflow-hidden relative">
              {headerImageUrl ? (
                <Image src={headerImageUrl} alt="" fill className="object-cover" />
              ) : (
                <div
                  className="w-full h-full opacity-20"
                  style={{
                    background: `linear-gradient(135deg, ${activeColor}40 0%, transparent 100%)`,
                  }}
                />
              )}
            </div>
          )}

          {/* Navigation Bar */}
          <header className="px-6 py-4 border-b border-border/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {showLogo && (
                <div
                  className="w-7 h-7 rounded-full overflow-hidden bg-muted border border-border/60 shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-2xs"
                  style={{ backgroundColor: activeColor }}
                >
                  {logoUrl ? (
                    <Image src={logoUrl} alt="" width={28} height={28} className="object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
              )}
              <span
                style={{ fontFamily: activeFont }}
                className="text-sm font-bold text-foreground truncate tracking-tight"
              >
                {displayName}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {navigation.length > 0 && (
                <nav className="flex items-center gap-3 text-xs text-muted-foreground">
                  {navigation.slice(0, 3).map((nav) => (
                    <span key={nav.id || nav.label} className="hover:text-foreground">
                      {nav.label}
                    </span>
                  ))}
                </nav>
              )}
              {showSubscribeButton && (
                <span
                  className="px-3 py-1 rounded-lg text-xs font-semibold text-white shadow-2xs transition-transform active:scale-95"
                  style={{ backgroundColor: activeColor }}
                >
                  S'abonner
                </span>
              )}
            </div>
          </header>

          {/* En-tête éditorial (Hero & Slogan) */}
          <div className="max-w-2xl mx-auto px-6 py-8 text-center space-y-2.5">
            <h1
              style={{ fontFamily: activeFont }}
              className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight"
            >
              {displayName}
            </h1>
            {showTagline && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {displayHero}
              </p>
            )}

            {showSocialLinks && socialLinks.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {socialLinks.map((s) => (
                  <span
                    key={s.id || s.platform}
                    className="px-2 py-0.5 rounded-md bg-muted/40 border border-border/40 text-[10px] font-mono text-muted-foreground capitalize"
                  >
                    {s.platform}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Flux d'articles réels */}
          <div className="max-w-2xl mx-auto px-6 space-y-5 pb-10">
            {/* Article 1 */}
            <article className="p-5 rounded-2xl bg-card border border-border/40 hover:border-border/80 transition-all space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span className="font-semibold text-foreground">ÉDITORIAL</span>
                <span>·</span>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: activeColor }}
                />
                <span>5 min de lecture · Aujourd'hui</span>
              </div>
              <h2
                style={{ fontFamily: activeFont }}
                className="text-base sm:text-lg font-bold text-foreground leading-snug"
              >
                L'art de la sobriété numérique et la renaissance de l'écrit
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                Comment s'émanciper du bruit des plateformes centralisées pour retrouver la
                profondeur de lecture et le temps long de la réflexion intellectuelle.
              </p>
            </article>

            {/* Article 2 */}
            <article className="p-5 rounded-2xl bg-card border border-border/40 hover:border-border/80 transition-all space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <span className="font-semibold text-foreground">ANALYSE</span>
                <span>·</span>
                <span>8 min de lecture · Il y a 2 jours</span>
              </div>
              <h2
                style={{ fontFamily: activeFont }}
                className="text-base sm:text-lg font-bold text-foreground leading-snug"
              >
                Pourquoi les créateurs indépendants reprennent le contrôle de leur audience
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                Face à la fragmentation des algorithmes de recommandation, le modèle de publication
                souverain sans intermédiaires s'impose comme une évidence pérenne.
              </p>
            </article>

            {/* Newsletter Wall */}
            {showNewsletterWall && (
              <section className="p-6 rounded-2xl bg-muted/20 border border-border/50 text-center space-y-3">
                <div className="space-y-1">
                  <h3
                    style={{ fontFamily: activeFont }}
                    className="text-sm font-bold text-foreground"
                  >
                    Recevoir les prochaines parutions
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Une lettre hebdomadaire soignée, sans spam, désinscription en un clic.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
                  <input
                    type="email"
                    readOnly
                    placeholder="votre.email@domaine.com"
                    className="w-full px-3 py-1.5 bg-background border border-border/50 rounded-lg text-xs text-muted-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 shadow-2xs cursor-pointer"
                    style={{ backgroundColor: activeColor }}
                  >
                    Rejoindre
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Flou progressif inférieur */}
        {showProgressiveBlur && (
          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-20 bg-gradient-to-t from-background via-background/60 to-transparent" />
        )}

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-border/30 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {displayName} · Tous droits réservés
        </footer>
      </div>
    </div>
  );
}
