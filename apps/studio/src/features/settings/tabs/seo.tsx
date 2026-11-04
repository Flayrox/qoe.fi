'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/seo.tsx
// =====================================================================

import React from 'react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';
import { Globe, Terminal, Share2, Trash2 } from 'lucide-react';
import type { CreatorProfile } from '../types';
import { SUPPORTED_SOCIAL_PLATFORMS } from '../types';
import { SeoPreview } from '../components/seo-preview';

interface SeoTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  isAdvancedMode: boolean;
  setIsAdvancedMode: React.Dispatch<React.SetStateAction<boolean>>;
  addSocialLink: (platform: string) => void;
  removeSocialLink: (idx: number) => void;
}

export function SeoTab({
  current,
  setCurrent,
  isAdvancedMode,
  setIsAdvancedMode,
  addSocialLink,
  removeSocialLink,
}: SeoTabProps) {
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
                  <Badge
                    variant="soft"
                    tone="brand"
                    shape="pill"
                    className="uppercase tracking-wider"
                  >
                    Auto-Pilot
                  </Badge>
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
              <Button
                variant="ghost"
                tone="brand"
                size="xs"
                onClick={() => {
                  setIsAdvancedMode(true);
                  toast.success(t`Mode Avancé débloqué`);
                }}
                className="shrink-0"
              >
                <Terminal />
                <span>Débloquer le mode avancé</span>
              </Button>
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
              <Badge variant="soft" tone="brand" className="font-mono font-bold">
                EXPERT
              </Badge>
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
              <Input
                type="text"
                value={current.seoTitle || ''}
                onChange={(e) => setCurrent((prev) => ({ ...prev, seoTitle: e.target.value }))}
                placeholder={t`Ex. Le Carnet de Sarah — Écrits & Analyses`}
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
              <Textarea
                size="sm"
                value={current.seoDescription || ''}
                onChange={(e) =>
                  setCurrent((prev) => ({ ...prev, seoDescription: e.target.value }))
                }
                placeholder={t`Description concise de votre ligne éditoriale pour les moteurs de recherche...`}
                rows={3}
              />
              <span className="text-[11px] text-muted-foreground block">
                Extrait descriptif affiché sous le titre dans les résultats de recherche.
              </span>
            </div>

            {/* Indexation Switch */}
            <div id="indexing" className="pt-3 border-t border-border/30">
              <Switch
                isSelected={current.allowIndexing}
                onChange={(checked) => setCurrent((prev) => ({ ...prev, allowIndexing: checked }))}
                label="Indexation par les moteurs de recherche"
                description="Autoriser les robots de Google, Bing et DuckDuckGo à référencer vos articles."
                className="w-full"
              />
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
            <Textarea
              size="sm"
              value={current.footerText || ''}
              onChange={(e) => setCurrent((prev) => ({ ...prev, footerText: e.target.value }))}
              placeholder={t`Ex. Tous droits réservés. Écrit avec passion sur qoefi.`}
              rows={2}
            />
            <span className="text-[11px] text-muted-foreground block">
              Mention affichée en bas de chaque page de votre site.
            </span>
          </div>
        </div>

        {/* Réseaux sociaux */}
        <div
          id="social"
          className="rounded-xl border border-border/50 bg-card p-5 space-y-4 shadow-2xs"
        >
          <div className="flex items-center gap-2 pb-2 border-b border-border/30">
            <Share2 className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Réseaux sociaux
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connectez vos profils pour permettre à vos lecteurs de vous suivre.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUPPORTED_SOCIAL_PLATFORMS.map((plat) => {
              const isConnected = current.socialLinks.some((s) => s.platform === plat.id);
              return (
                <Button
                  key={plat.id}
                  variant="outline"
                  size="xs"
                  disabled={isConnected}
                  onClick={() => addSocialLink(plat.id)}
                >
                  {plat.name} {isConnected && '✓'}
                </Button>
              );
            })}
          </div>

          {current.socialLinks.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/30">
              {current.socialLinks.map((s, idx) => {
                const platformLabel =
                  SUPPORTED_SOCIAL_PLATFORMS.find((p) => p.id === s.platform)?.name ?? s.platform;
                return (
                  <div
                    key={s.platform}
                    className="flex items-center gap-2 p-2 bg-muted/20 border border-border/30 rounded-lg"
                  >
                    <span className="text-xs font-semibold text-foreground w-24 px-1 truncate">
                      {platformLabel}
                    </span>
                    <Input
                      type="url"
                      size="sm"
                      value={s.url}
                      aria-label={`URL du profil ${platformLabel}`}
                      placeholder="https://..."
                      onChange={(e) => {
                        const updated = [...current.socialLinks];
                        updated[idx] = { ...updated[idx], url: e.target.value };
                        setCurrent((prev) => ({ ...prev, socialLinks: updated }));
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      tone="danger"
                      size="xs"
                      shape="icon"
                      onClick={() => removeSocialLink(idx)}
                      title={`Retirer ${platformLabel}`}
                      aria-label={`Retirer ${platformLabel}`}
                      className="shrink-0"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
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
