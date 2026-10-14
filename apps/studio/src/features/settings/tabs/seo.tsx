'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/seo.tsx
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Globe, Terminal } from 'lucide-react';
import type { CreatorProfile } from '../types';
import { SeoPreview } from '../components/seo-preview';

interface SeoTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  isAdvancedMode: boolean;
  setIsAdvancedMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export function SeoTab({ current, setCurrent, isAdvancedMode, setIsAdvancedMode }: SeoTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Formulaire SEO */}
      <div className="lg:col-span-7 space-y-6">
        {!isAdvancedMode ? (
          /* ── Mode Standard : Auto-Pilot SEO ── */
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-foreground">
                    Référencement entièrement automatisé
                  </h4>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                    Auto-Pilot
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Qoefi génère et met à jour en continu vos balises méta Google, vos aperçus
                  OpenGraph / Twitter Cards, votre sitemap XML et les données structurées Schema.org
                  à partir du nom et du slogan de votre site web.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground text-[11px]">
                Besoin de rédiger manuellement vos balises ou de modifier les robots ?
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsAdvancedMode(true);
                  toast.success(t`Mode Avancé débloqué`);
                }}
                className="font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Débloquer le mode avancé</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── Mode Avancé : Surcharges manuelles ── */
          <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Surcharge manuelle SEO (Mode Avancé)
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                EXPERT
              </span>
            </div>

            {/* Meta Title */}
            <div id="meta" className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground block">
                  Titre META (SEO) personnalisé
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {current.seoTitle?.length || 0}/60 car.
                </span>
              </div>
              <input
                type="text"
                value={current.seoTitle || ''}
                onChange={(e) => setCurrent((prev) => ({ ...prev, seoTitle: e.target.value }))}
                placeholder={t`Ex. Le Carnet de Sarah — Écrits & Analyses`}
                className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
              />
              <span className="text-[11px] text-muted-foreground block">
                Remplace le titre automatique généré par Qoefi sur Google.
              </span>
            </div>

            {/* Meta Description */}
            <div className="space-y-1.5 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground block">
                  Description META personnalisée
                </label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {current.seoDescription?.length || 0}/160 car.
                </span>
              </div>
              <textarea
                value={current.seoDescription || ''}
                onChange={(e) =>
                  setCurrent((prev) => ({ ...prev, seoDescription: e.target.value }))
                }
                placeholder={t`Description concise de votre ligne éditoriale pour les moteurs de recherche...`}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
              />
              <span className="text-[11px] text-muted-foreground block">
                Extrait descriptif affiché sous le titre dans les résultats de recherche.
              </span>
            </div>

            {/* Indexation Switch */}
            <div
              id="indexing"
              className="pt-3 border-t border-border/30 flex items-center justify-between gap-4"
            >
              <div>
                <label className="text-xs font-semibold text-foreground block">
                  Indexation par les moteurs de recherche
                </label>
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  Autoriser les robots de Google, Bing et DuckDuckGo à référencer vos articles.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={current.allowIndexing}
                  onChange={(e) =>
                    setCurrent((prev) => ({ ...prev, allowIndexing: e.target.checked }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-background after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
          </div>
        )}

        {/* Footer Text */}
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3 shadow-2xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pied de page (Footer)
          </h3>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              Mention de pied de page
            </label>
            <textarea
              value={current.footerText || ''}
              onChange={(e) => setCurrent((prev) => ({ ...prev, footerText: e.target.value }))}
              placeholder={t`Ex. Tous droits réservés. Écrit avec passion sur qoefi.`}
              rows={2}
              className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
            />
            <span className="text-[11px] text-muted-foreground block">
              Mention affichée en bas de chaque page de votre site.
            </span>
          </div>
        </div>
      </div>

      {/* Aperçu SEO en direct */}
      <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
        <SeoPreview
          name={current.name}
          subdomain={current.subdomain}
          customDomain={current.customDomain}
          seoTitle={current.seoTitle}
          seoDescription={current.seoDescription}
          heroText={current.heroText}
          headerImageUrl={current.headerImageUrl}
          logoUrl={current.logoUrl}
          allowIndexing={current.allowIndexing}
          isAdvancedMode={isAdvancedMode}
        />
      </div>
    </div>
  );
}
