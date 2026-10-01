'use client';

// =====================================================================
// 🔍 SeoPreview — Simulateur Google SERP & Carte Réseaux Sociaux (SEO)
// =====================================================================

import React, { useState } from 'react';
import Image from 'next/image';
import { Search, Share2, Globe, ShieldCheck, ShieldAlert } from 'lucide-react';

interface SeoPreviewProps {
  name: string | null;
  subdomain: string | null;
  customDomain: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  headerImageUrl: string | null;
  logoUrl: string | null;
  allowIndexing: boolean;
}

export function SeoPreview({
  name,
  subdomain,
  customDomain,
  seoTitle,
  seoDescription,
  headerImageUrl,
  logoUrl,
  allowIndexing,
}: SeoPreviewProps) {
  const [view, setView] = useState<'google' | 'social'>('google');

  const domain = customDomain || `${subdomain || 'publication'}.qoe.fi`;
  const url = `https://${domain}`;
  const title = seoTitle?.trim() || `${name || 'Ma Publication'} — Écrits & Analyses`;
  const description =
    seoDescription?.trim() ||
    `Découvrez les publications, analyses et articles exclusifs de ${name || 'cette publication'} sur qoefi.`;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Header bar with switch */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {allowIndexing ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold tracking-wider uppercase border border-primary/20">
              <ShieldCheck className="w-3 h-3" />
              Indexable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold tracking-wider uppercase border border-destructive/20">
              <ShieldAlert className="w-3 h-3" />
              Non indexé (noindex)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setView('google')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              view === 'google'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="w-3 h-3" />
            <span>Google SERP</span>
          </button>
          <button
            type="button"
            onClick={() => setView('social')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              view === 'social'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Share2 className="w-3 h-3" />
            <span>Partage Réseaux</span>
          </button>
        </div>
      </div>

      <div className="p-5">
        {view === 'google' ? (
          /* ──────── Google Search Simulator ──────── */
          <div className="space-y-2 bg-background p-4 rounded-xl border border-border/40 shadow-xs">
            {/* Breadcrumb line */}
            <div className="flex items-center gap-2 text-xs">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground overflow-hidden border border-border/40 shrink-0">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Favicon"
                    width={20}
                    height={20}
                    className="object-cover"
                  />
                ) : (
                  (name || 'Q').charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground leading-none">
                  {name || 'Publication'}
                </span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                  {url}
                </span>
              </div>
            </div>

            {/* Clickable Title */}
            <h4 className="text-base font-semibold text-primary hover:underline cursor-pointer leading-snug">
              {title}
            </h4>

            {/* Description snippet */}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {description}
            </p>
          </div>
        ) : (
          /* ──────── Social OpenGraph / Twitter Card Simulator ──────── */
          <div className="rounded-xl border border-border/40 overflow-hidden bg-background shadow-xs max-w-md mx-auto">
            {/* Social Card Image */}
            <div className="relative w-full h-44 bg-muted/40 overflow-hidden">
              {headerImageUrl ? (
                <Image
                  src={headerImageUrl}
                  alt={title}
                  fill
                  className="object-cover"
                  sizes="400px"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted/80 p-4 text-center">
                  <Globe className="w-8 h-8 text-primary/40 mb-2" />
                  <span className="text-xs font-bold text-foreground">{name || 'Publication'}</span>
                </div>
              )}
            </div>

            {/* Social Card Metadata */}
            <div className="p-3.5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                {domain}
              </span>
              <h5 className="text-xs font-bold text-foreground line-clamp-1">{title}</h5>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-2.5 bg-muted/20 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Titre : <strong className="text-foreground">{seoTitle?.length || 0}</strong>/60 car.
        </span>
        <span>
          Description : <strong className="text-foreground">{seoDescription?.length || 0}</strong>
          /160 car.
        </span>
      </div>
    </div>
  );
}
