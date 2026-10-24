'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/general.tsx
// =====================================================================
// Onglet Identité & Design :
// Interface « Zéro Scroll » ultra directe, compacte et sans modales.
// Tout est paramétrable sous les yeux en 1 écran.
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { t } from '@lingui/core/macro';
import { ColorPicker } from '@qoe/ui';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { cn } from '@qoe/utils';
import {
  ExternalLink,
  Check,
  Globe,
  User,
  SlidersHorizontal,
  Palette,
  Image as ImageIcon,
  PenTool,
  Trash2,
  Building2,
  ShieldCheck,
} from 'lucide-react';

import type { CreatorProfile } from '../types';
import { ACCENT_SWATCHES, SITE_FONTS, SITE_OPTION_ITEMS } from '../types';
import { MediaProfilePreviewEditor } from '../components/MediaProfilePreviewEditor';

interface GeneralTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  consoleSettingsUrl: string;
  publicBlogUrl?: string;
}

export function GeneralTab({
  current,
  setCurrent,
  consoleSettingsUrl,
  publicBlogUrl,
}: GeneralTabProps) {
  // Commutateur de portée : Site Web vs Profil public
  const [identityScope, setIdentityScope] = useState<'tenant' | 'core'>('tenant');
  const isMedia = Boolean(current.isMedia);

  const activeFontId = current.fontFamily || 'sans';
  const activeColorHex = current.accentColor || '#EE4B2B';
  const isLogoSquare = Boolean(current.siteOptions?.logoShapeSquare);

  const toggleSiteOption = (key: string) => {
    setCurrent((prev) => {
      const existing = (prev.siteOptions?.[key] ?? true) !== false;
      return {
        ...prev,
        siteOptions: {
          ...(prev.siteOptions || {}),
          [key]: !existing,
        },
      };
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* ── EN-TÊTE COMPACT & LIEN DIRECT VERS LE VRAI SITE ── */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/40 w-fit">
          <button
            type="button"
            onClick={() => setIdentityScope('tenant')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              identityScope === 'tenant'
                ? 'bg-background text-foreground shadow-2xs border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span>Site Web</span>
          </button>

          <button
            type="button"
            onClick={() => setIdentityScope('core')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              identityScope === 'core'
                ? 'bg-background text-foreground shadow-2xs border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5 text-primary" />
            <span>{isMedia ? 'Profil du média' : 'Votre profil'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {publicBlogUrl && (
            <a
              href={publicBlogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 shadow-2xs transition-all active:scale-95"
              title="Ouvrir le vrai site web dans un nouvel onglet"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Voir mon site en direct ↗</span>
            </a>
          )}
        </div>
      </div>

      {/* =====================================================================
          VUE 1 : SITE WEB & PUBLICATION (ZÉRO SCROLL, 2 COLONNES)
          ===================================================================== */}
      {identityScope === 'tenant' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── COLONNE GAUCHE : IDENTITÉ & STYLE ── */}
          <div className="space-y-4">
            {/* 1. Identité du site */}
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PenTool className="w-3.5 h-3.5 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Identité du site
                  </h3>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {current.subdomain ? `${current.subdomain}.qoe.fi` : ''}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Nom du site web
                </label>
                <input
                  type="text"
                  value={current.name || ''}
                  onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex. Carnet d'Éphémère"
                  className="w-full px-3 py-2 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground block">
                    Slogan éditorial (Tagline)
                  </label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {current.heroText?.length || 0}/180
                  </span>
                </div>
                <textarea
                  value={current.heroText || ''}
                  onChange={(e) => setCurrent((prev) => ({ ...prev, heroText: e.target.value }))}
                  maxLength={180}
                  rows={2}
                  placeholder="Ex. Analyses, essais et récits"
                  className="w-full px-3 py-2 bg-background border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                />
              </div>
            </div>

            {/* 2. Style & Direction artistique */}
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Style & Typographie
                </h3>
              </div>

              {/* Polices */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Police typographique
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SITE_FONTS.map((font) => {
                    const isSelected = activeFontId === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setCurrent((prev) => ({ ...prev, fontFamily: font.id }))}
                        className={cn(
                          'p-2.5 rounded-lg border text-left transition-all cursor-pointer',
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-2xs'
                            : 'border-border/40 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                        )}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {font.name.split(' ')[0]}
                          </span>
                          {isSelected && <Check className="w-3 h-3 text-primary shrink-0" />}
                        </div>
                        <p
                          style={{ fontFamily: font.family }}
                          className="text-[11px] text-foreground/80 font-medium truncate"
                        >
                          Écriture libre
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Couleur d'accentuation */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-foreground block">
                  Couleur d'accentuation
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCENT_SWATCHES.map((swatch) => {
                    const isSelected = activeColorHex.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => setCurrent((prev) => ({ ...prev, accentColor: swatch.hex }))}
                        title={swatch.name}
                        className={cn(
                          'w-6 h-6 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center shrink-0',
                          isSelected
                            ? 'border-foreground scale-110 shadow-xs'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: swatch.hex }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white drop-shadow-sm" />}
                      </button>
                    );
                  })}

                  <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-border/40">
                    <input
                      type="color"
                      value={activeColorHex}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="w-6 h-6 rounded-full border border-border/50 cursor-pointer p-0 bg-transparent"
                      title="Couleur personnalisée"
                    />
                    <span className="text-[11px] font-mono text-muted-foreground uppercase">
                      {activeColorHex}
                    </span>
                  </div>
                </div>
              </div>

              {/* Couleur de fond du site (sur-mesure) */}
              <div className="space-y-1.5 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground block">
                    Couleur de fond du site
                  </label>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {(current.siteOptions?.backgroundColor as string)
                      ? 'Personnalisé'
                      : 'Par défaut (Neutre)'}
                  </span>
                </div>

                <ColorPicker
                  value={(current.siteOptions?.backgroundColor as string) || null}
                  onChange={(hex) =>
                    setCurrent((prev) => ({
                      ...prev,
                      siteOptions: {
                        ...(prev.siteOptions || {}),
                        backgroundColor: hex,
                      },
                    }))
                  }
                  defaultLabel="Thème neutre standard"
                />
              </div>
            </div>
          </div>

          {/* ── COLONNE DROITE : MÉDIAS & BLOCS D'AFFICHAGE ── */}
          <div className="space-y-4">
            {/* 3. Médias & Identité Visuelle */}
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Médias du site
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                {/* Logo */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Logo du site</label>
                    {current.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setCurrent((prev) => ({ ...prev, logoUrl: null }))}
                        className="text-[11px] text-destructive hover:underline cursor-pointer"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <div className="max-w-[100px] mx-auto">
                    <ImageUploader
                      value={current.logoUrl}
                      onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                      }
                      aspect={1}
                      shape={isLogoSquare ? 'square' : 'circle'}
                      maxDimension={512}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Avatar 512x512 png/svg
                  </p>
                </div>

                {/* Wordmark : logo typographique de l'en-tête */}
                <div className="sm:col-span-2 p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Wordmark</label>
                    {Boolean(current.siteOptions?.wordmarkUrl) && (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrent((prev) => ({
                            ...prev,
                            siteOptions: { ...(prev.siteOptions || {}), wordmarkUrl: null },
                          }))
                        }
                        className="text-[11px] text-destructive hover:underline cursor-pointer"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <ImageUploader
                    value={(current.siteOptions?.wordmarkUrl as string | undefined) || null}
                    onChange={(url) =>
                      setCurrent((prev) => ({
                        ...prev,
                        siteOptions: { ...(prev.siteOptions || {}), wordmarkUrl: url },
                      }))
                    }
                    upload={(file) =>
                      uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
                    }
                    shape="banner"
                    maxDimension={1600}
                  />
                  <p className="text-[10px] text-muted-foreground text-center">
                    Logo texte PNG/SVG, remplace le nom dans l'en-tête
                  </p>
                </div>

                {/* Bannière / Image d'en-tête */}
                <div className="sm:col-span-3 p-3 rounded-lg border border-border/40 bg-muted/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Bannière d'en-tête
                    </label>
                    {current.headerImageUrl && (
                      <button
                        type="button"
                        onClick={() => setCurrent((prev) => ({ ...prev, headerImageUrl: null }))}
                        className="text-[11px] text-destructive hover:underline cursor-pointer"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <div className="w-full">
                    <ImageUploader
                      value={current.headerImageUrl}
                      onChange={(url) => setCurrent((prev) => ({ ...prev, headerImageUrl: url }))}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
                      }
                      aspect={16 / 9}
                      shape="square"
                      maxDimension={1920}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    En-tête horizontal
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Affichage des blocs & Options */}
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Affichage des blocs
                  </h3>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Activez/désactivez en 1 clic
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'showBanner', label: 'Bannière d’en-tête' },
                  { key: 'showLogo', label: 'Logo / Avatar' },
                  { key: 'showTagline', label: 'Slogan éditorial' },
                  { key: 'showSubscribeButton', label: 'Bouton S’abonner' },
                  { key: 'showCategoryTabs', label: 'Onglets rubriques' },
                  { key: 'showCraftIndex', label: 'Sommaire Craft' },
                  { key: 'showProgressiveBlur', label: 'Flou progressif' },
                  { key: 'showNewsletterWall', label: 'Mur newsletter' },
                ].map((item) => {
                  const isEnabled = (current.siteOptions?.[item.key] ?? true) !== false;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleSiteOption(item.key)}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-lg border text-xs font-medium transition-all cursor-pointer',
                        isEnabled
                          ? 'border-border/60 bg-muted/30 text-foreground'
                          : 'border-border/30 bg-muted/10 text-muted-foreground/60'
                      )}
                    >
                      <span className="truncate pr-1 text-[11px]">{item.label}</span>
                      <div
                        className={cn(
                          'w-7 h-4 rounded-full transition-colors relative shrink-0',
                          isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      >
                        <div
                          className={cn(
                            'w-3 h-3 rounded-full bg-white transition-transform absolute top-0.5',
                            isEnabled ? 'left-3.5' : 'left-0.5'
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : isMedia ? (
        /* =====================================================================
           VUE 2A : PROFIL DU MÉDIA (PREVIEW INTERACTIVE INTELIGENTE)
           ===================================================================== */
        <MediaProfilePreviewEditor current={current} setCurrent={setCurrent} />
      ) : (
        /* =====================================================================
           VUE 2B : COMPTE PERSONNEL (PASSE PAR LE CORE QOEFI)
           ===================================================================== */
        <div className="max-w-2xl mx-auto rounded-2xl border border-border/50 bg-card p-6 space-y-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Profil personnel d'auteur</h3>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
              Géré sur le Core
            </span>
          </div>

          {/* Carte d'identité actuelle en lecture seule */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/20 border border-border/40">
            <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
              {current.logoUrl ? (
                <img
                  src={current.logoUrl}
                  alt={current.name || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {(current.name || 'A').charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-foreground truncate">
                  {current.name || 'Auteur Qoefi'}
                </h4>
                {current.username && (
                  <span className="text-xs text-muted-foreground font-mono">
                    @{current.username}
                  </span>
                )}
              </div>

              {current.heroText ? (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {current.heroText}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Aucune biographie renseignée pour le moment.
                </p>
              )}
            </div>
          </div>

          {/* Explication & Action vers le Core */}
          <div className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Votre identité publique d'auteur (nom, biographie, photo de profil et sécurité) est
              centralisée sur le réseau souverain Qoefi. Les modifications sont instantanément
              répercutées sur l'ensemble de vos écrits et de vos interactions.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground font-medium">
                Modification du profil, avatar ou sécurité :
              </span>
              <a
                href={consoleSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <span>Gérer mon profil sur Qoefi Core</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
