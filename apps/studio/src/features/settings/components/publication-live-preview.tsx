'use client';

// =====================================================================
// 🎨 PublicationLivePreview — Aperçu en direct du Tenant (Studio Qoefi)
// =====================================================================
// Rendu fidèle du header et de l'ambiance du site créateur (tenant).
// Réagit instantanément aux modifications sans aucune latence.
// =====================================================================

import React from 'react';
import Image from 'next/image';
import { ExternalLink, Sparkles, Globe } from 'lucide-react';
import type { ClientNavigationItem } from './visual-studio';

interface PublicationLivePreviewProps {
  name: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  subdomain: string | null;
  navigation?: ClientNavigationItem[];
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
  subdomain,
  navigation = [],
}: PublicationLivePreviewProps) {
  const activeFont = FONT_FAMILIES[fontFamily || 'sans'] || "'Inter', sans-serif";
  const activeColor = accentColor || '#EE4B2B';
  const displayName = name?.trim() || 'Ma Publication';
  const displayHero = heroText?.trim() || "Réflexions, analyses et récits d'écriture indépendante.";
  const displayDomain = `${subdomain || 'publication'}.qoe.fi`;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all">
      {/* Mock Browser Top Bar */}
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 opacity-60">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-background/80 border border-border/40 text-[11px] text-muted-foreground max-w-[220px] truncate select-none">
          <Globe className="w-3 h-3 text-primary shrink-0" />
          <span className="truncate">{displayDomain}</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-primary/80">
          <Sparkles className="w-3 h-3" />
          <span>Aperçu Tenant</span>
        </div>
      </div>

      {/* Hero Canvas */}
      <div className="relative">
        {/* Banner Cover (21/9 or minimum height) */}
        <div className="relative w-full h-36 sm:h-44 bg-muted/30 overflow-hidden">
          {headerImageUrl ? (
            <Image
              src={headerImageUrl}
              alt="Couverture"
              fill
              className="object-cover transition-opacity duration-300"
              sizes="(max-width: 768px) 100vw, 480px"
              priority={false}
            />
          ) : (
            <div
              className="w-full h-full opacity-60 transition-all duration-500"
              style={{
                background: `linear-gradient(135deg, ${activeColor}22 0%, transparent 60%), radial-gradient(circle at top right, ${activeColor}33 0%, transparent 70%)`,
              }}
            />
          )}
          {/* Subtle bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent" />
        </div>

        {/* Content Container */}
        <div className="px-5 pb-6 -mt-10 relative z-10">
          {/* Logo / Avatar */}
          <div className="flex items-end justify-between gap-3 mb-4">
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-card bg-card shadow-md shrink-0">
              {logoUrl ? (
                <Image src={logoUrl} alt={displayName} fill className="object-cover" sizes="80px" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xl font-bold text-white transition-colors"
                  style={{ backgroundColor: activeColor }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Simulated CTA Button */}
            <div className="pb-1">
              <span
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs select-none transition-colors"
                style={{ backgroundColor: activeColor }}
              >
                S'abonner
              </span>
            </div>
          </div>

          {/* Title & Tagline with dynamic typography */}
          <div style={{ fontFamily: activeFont }} className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground tracking-tight leading-snug">
              {displayName}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {displayHero}
            </p>
          </div>

          {/* Simulated Navigation Bar */}
          {navigation.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/40 flex items-center gap-3 overflow-x-auto text-[11px] font-medium text-muted-foreground">
              {navigation.slice(0, 4).map((item, idx) => (
                <span
                  key={idx}
                  className="hover:text-foreground transition-colors shrink-0 flex items-center gap-1 cursor-default"
                >
                  {item.label}
                  {item.isExternal && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Info Pill */}
      <div className="px-5 py-2.5 bg-muted/20 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Police : <strong className="text-foreground capitalize">{fontFamily || 'Sans'}</strong>
        </span>
        <div className="flex items-center gap-1.5">
          <span>Accent :</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-black/10 inline-block"
            style={{ backgroundColor: activeColor }}
          />
          <code className="text-[10px] text-foreground font-mono">{activeColor.toUpperCase()}</code>
        </div>
      </div>
    </div>
  );
}
