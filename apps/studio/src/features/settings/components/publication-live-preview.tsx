'use client';

// =====================================================================
// 🎨 PublicationLivePreview — Aperçu en direct Tenant ↔ Profil Core
// =====================================================================
// Permet au créateur de visualiser simultanément :
// 1. Son vrai site web autonome (Tenant : *.qoe.fi) avec grand Hero
// 2. Son profil dans le réseau social de lecture (Core : qoe.fi/@username)
// =====================================================================

import React, { useState } from 'react';
import Image from 'next/image';
import { Sparkles, Globe, User, BookOpen, Layers } from 'lucide-react';
import type { ClientNavigationItem, ClientSocialLink } from './publication-settings';

interface PublicationLivePreviewProps {
  name: string | null;
  heroText: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  subdomain: string | null;
  username?: string | null;
  navigation?: ClientNavigationItem[];
  socialLinks?: ClientSocialLink[];
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
  username,
  navigation = [],
  socialLinks = [],
}: PublicationLivePreviewProps) {
  const [previewTab, setPreviewTab] = useState<'tenant' | 'core'>('tenant');

  const activeFont = FONT_FAMILIES[fontFamily || 'sans'] || "'Inter', sans-serif";
  const activeColor = accentColor || '#EE4B2B';
  const displayName = name?.trim() || 'Ma Publication';
  const displayHero =
    heroText?.trim() ||
    "Un espace dédié aux écrits de fond, aux analyses indépendantes et au partage d'idées.";
  const displayDomain = `${subdomain || 'publication'}.qoe.fi`;
  const displayHandle = username || subdomain || 'auteur';

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all">
      {/* Top Bar with View Switcher */}
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 opacity-60">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center gap-1 bg-muted/70 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setPreviewTab('tenant')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              previewTab === 'tenant'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="w-3 h-3 text-primary" />
            <span>Site Web (Tenant)</span>
          </button>

          <button
            type="button"
            onClick={() => setPreviewTab('core')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              previewTab === 'core'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3 h-3 text-muted-foreground" />
            <span>Profil Réseau (Core)</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-primary/80">
          <Sparkles className="w-3 h-3" />
          <span className="hidden sm:inline">Direct</span>
        </div>
      </div>

      {previewTab === 'tenant' ? (
        /* ═════════════════════════════════════════════════════════════
           VUE 1 : VRAI TENANT (Reproduction fidèle de apps/tenants)
           ═════════════════════════════════════════════════════════════ */
        <div className="relative">
          {/* Tenant Header Navigation Bar */}
          <div className="px-5 py-3 border-b border-border/40 bg-background/80 backdrop-blur-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-7 h-7 rounded-lg overflow-hidden bg-muted border border-border/40 shrink-0">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt={displayName}
                    fill
                    className="object-cover"
                    sizes="28px"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-xs font-bold text-primary-foreground"
                    style={{ backgroundColor: activeColor }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span
                style={{ fontFamily: activeFont }}
                className="text-xs font-bold text-foreground truncate"
              >
                {displayName}
              </span>
            </div>

            {/* Simulated Nav Links */}
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
              {navigation.length > 0 ? (
                navigation.slice(0, 3).map((item, idx) => (
                  <span key={idx} className="hover:text-foreground truncate max-w-[80px]">
                    {item.label}
                  </span>
                ))
              ) : (
                <>
                  <span className="text-foreground">Articles</span>
                  <span>À propos</span>
                </>
              )}
            </div>

            <span
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-white shadow-2xs shrink-0 select-none"
              style={{ backgroundColor: activeColor }}
            >
              S'abonner
            </span>
          </div>

          {/* Grand Hero Section Immersif (Vrai style du Tenant) */}
          <div className="relative overflow-hidden px-6 py-10 text-center flex flex-col items-center justify-center min-h-[190px]">
            {/* Background cover image or soft mesh gradient */}
            {headerImageUrl ? (
              <div className="absolute inset-0 w-full h-full -z-10">
                <Image
                  src={headerImageUrl}
                  alt="Couverture"
                  fill
                  className="object-cover"
                  sizes="500px"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/60 to-background z-10" />
              </div>
            ) : (
              <div
                className="absolute inset-0 w-full h-full -z-10 opacity-30"
                style={{
                  background: `radial-gradient(circle at center, ${activeColor}33 0%, transparent 70%)`,
                }}
              />
            )}

            {/* Big Hero Title in active typography */}
            <h2
              style={{ fontFamily: activeFont }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground max-w-md leading-tight mb-2"
            >
              {displayName}
            </h2>

            {/* Slogan éditorial */}
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4 line-clamp-2">
              {displayHero}
            </p>

            {/* Social Icons row */}
            {socialLinks.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground text-[10px]">
                {socialLinks.slice(0, 4).map((s) => (
                  <span
                    key={s.platform}
                    className="px-2 py-0.5 rounded bg-muted/40 border border-border/30 capitalize"
                  >
                    {s.platform}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Mini Articles Feed Section Preview */}
          <div className="p-4 bg-muted/15 border-t border-border/30 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-primary" />
                Dernières parutions sur votre site
              </span>
              <span className="text-[10px]">3 min • Éditorial</span>
            </div>

            <div className="p-3 rounded-xl border border-border/40 bg-card/60 shadow-2xs space-y-1">
              <span
                className="text-[10px] font-bold tracking-wider uppercase"
                style={{ color: activeColor }}
              >
                Analyse & Idées
              </span>
              <h4 style={{ fontFamily: activeFont }} className="text-xs font-bold text-foreground">
                Premier article publié sur {displayName}
              </h4>
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                La publication autonome permet aux auteurs de garder le contrôle total de leur
                audience...
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════
           VUE 2 : PROFIL RÉSEAU (Reproduction de apps/core ProfileView)
           ═════════════════════════════════════════════════════════════ */
        <div className="relative">
          {/* Banner */}
          <div className="h-24 w-full bg-muted/40 relative overflow-hidden">
            {headerImageUrl && (
              <Image
                src={headerImageUrl}
                alt="Bannière"
                fill
                className="object-cover"
                sizes="500px"
              />
            )}
          </div>

          {/* Profile Header Info */}
          <div className="px-5 pb-5 relative">
            <div className="flex items-end justify-between -mt-8 mb-3">
              <div className="w-16 h-16 rounded-full overflow-hidden border-3 border-card bg-card shadow-md shrink-0">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt={displayName}
                    width={64}
                    height={64}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-lg font-bold text-primary-foreground"
                    style={{ backgroundColor: activeColor }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <span className="px-3.5 py-1.5 rounded-lg border border-border/60 bg-muted/30 text-xs font-semibold text-foreground select-none">
                Suivre
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground leading-tight">{displayName}</h3>
              <p className="text-xs text-muted-foreground font-medium">@{displayHandle}</p>
              <p className="text-xs text-foreground/80 leading-relaxed pt-1 line-clamp-2">
                {displayHero}
              </p>
            </div>

            {/* Core Tabs Simulation */}
            <div className="mt-4 pt-2 border-t border-border/30 flex items-center gap-4 text-xs font-medium text-muted-foreground">
              <span className="text-foreground font-semibold border-b-2 border-primary pb-1 -mb-px">
                Pensées
              </span>
              <span>Articles</span>
              <span>Médias</span>
            </div>
          </div>

          {/* Notice Explanative */}
          <div className="p-3 bg-muted/20 border-t border-border/30 flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
            <Layers className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span>
              Dans l'app centrale <strong>qoe.fi</strong>, vos lecteurs vous découvrent via cette
              carte sociale. Votre site souverain reste hébergé sur{' '}
              <strong className="text-foreground">{displayDomain}</strong>.
            </span>
          </div>
        </div>
      )}

      {/* Footer Pill with Domain and Design Token recap */}
      <div className="px-5 py-2.5 bg-muted/25 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate max-w-[180px]">
          URL : <strong className="text-foreground font-mono">{displayDomain}</strong>
        </span>
        <div className="flex items-center gap-2">
          <span>{fontFamily || 'Sans'}</span>
          <span
            className="w-2.5 h-2.5 rounded-full border border-border inline-block"
            style={{ backgroundColor: activeColor }}
          />
        </div>
      </div>
    </div>
  );
}
