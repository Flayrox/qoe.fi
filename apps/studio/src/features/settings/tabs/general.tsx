'use client';

// =====================================================================
// ⚡ apps/studio/src/features/settings/tabs/general.tsx
// =====================================================================
// Onglet Identité & Design :
// 1. Vue Site Web (Tenant) :
//    - 4 tuiles compactes pour les 4 volets essentiels (Identité, Style, Médias, Blocs)
//    - Chaque volet s'ouvre dans une pop-up modale dédiée (encombrement vertical minimal)
//    - Aperçu direct et fidèle du site web en plein écran sans artifice
// 2. Vue Profil Auteur (Core) :
//    - Template fidèle et immersif du profil auteur tel qu'il apparaît sur le réseau qoe.fi
// =====================================================================

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { t } from '@lingui/core/macro';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import { cn } from '@qoe/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@qoe/ui';
import {
  ExternalLink,
  Check,
  Globe,
  User,
  SlidersHorizontal,
  Info,
  Layers,
  Palette,
  Image as ImageIcon,
  PenTool,
  Bookmark,
  MessageSquare,
  Share2,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

import type { CreatorProfile } from '../types';
import { ACCENT_SWATCHES, SITE_FONTS, SITE_OPTION_ITEMS } from '../types';
import { Preview } from '../preview';

interface GeneralTabProps {
  current: CreatorProfile;
  setCurrent: React.Dispatch<React.SetStateAction<CreatorProfile>>;
  consoleSettingsUrl: string;
}

type ModalType = 'identity' | 'style' | 'media' | 'blocks' | 'mediaProfile' | null;

export function GeneralTab({ current, setCurrent, consoleSettingsUrl }: GeneralTabProps) {
  // Commutateur de portée : Site Web vs Profil public
  const [identityScope, setIdentityScope] = useState<'tenant' | 'core'>('tenant');
  const isMedia = Boolean(current.isMedia);

  // État de la pop-up active
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Nombre d'options activées pour la tuile Blocs
  const activeOptionsCount = SITE_OPTION_ITEMS.filter(
    (item) => (current.siteOptions?.[item.key] ?? true) !== false
  ).length;

  const activeFontName =
    SITE_FONTS.find((f) => f.id === (current.fontFamily || 'sans'))?.name || 'Inter';

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* =====================================================================
          COMMUTATEUR DE PORTÉE : SITE WEB vs PROFIL PUBLIC
          ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/40 w-fit">
          <button
            type="button"
            onClick={() => setIdentityScope('tenant')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              identityScope === 'core'
                ? 'bg-background text-foreground shadow-2xs border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5 text-primary" />
            <span>{isMedia ? 'Profil du média' : 'Votre profil'}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {process.env.NODE_ENV === 'development' && (
            <Link
              href="/settings/design"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border/40 shadow-2xs transition-all active:scale-95"
            >
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>Stage Design (Dev)</span>
            </Link>
          )}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Aperçu dynamique ci-dessous
          </span>
        </div>
      </div>

      {/* =====================================================================
          VUE 1 : SITE WEB & PUBLICATION (TENANT)
          ===================================================================== */}
      {identityScope === 'tenant' && (
        <div className="space-y-8">
          {/* ── BARRE FLOTTANTE / STICKY TOOLBAR (Style Éditeur d'Article) ── */}
          <div className="sticky top-20 z-20 w-full">
            <div className="flex items-center justify-between gap-1 p-1.5 rounded-2xl bg-card/90 backdrop-blur-xl border border-border/80 shadow-md">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none w-full sm:w-auto">
                {/* 1. Identité */}
                <button
                  type="button"
                  onClick={() => setActiveModal('identity')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/70 text-foreground transition-all cursor-pointer border border-transparent hover:border-border/50 text-xs font-semibold shrink-0"
                >
                  <PenTool className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate max-w-[130px] sm:max-w-[180px]">
                    {current.name || 'Identité'}
                  </span>
                </button>

                <div className="h-4 w-px bg-border/60 shrink-0" />

                {/* 2. Style & Design */}
                <button
                  type="button"
                  onClick={() => setActiveModal('style')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/70 text-foreground transition-all cursor-pointer border border-transparent hover:border-border/50 text-xs font-semibold shrink-0"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: current.accentColor || '#EE4B2B' }}
                  />
                  <span>Craft</span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {activeFontName}
                  </span>
                </button>

                <div className="h-4 w-px bg-border/60 shrink-0" />

                {/* 3. Médias */}
                <button
                  type="button"
                  onClick={() => setActiveModal('media')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/70 text-foreground transition-all cursor-pointer border border-transparent hover:border-border/50 text-xs font-semibold shrink-0"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Médias</span>
                  {current.logoUrl && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                  )}
                </button>

                <div className="h-4 w-px bg-border/60 shrink-0" />

                {/* 4. Blocs de page */}
                <button
                  type="button"
                  onClick={() => setActiveModal('blocks')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/70 text-foreground transition-all cursor-pointer border border-transparent hover:border-border/50 text-xs font-semibold shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                  <span>Blocs</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/40">
                    {activeOptionsCount}/8
                  </span>
                </button>
              </div>

              <div className="hidden md:flex items-center gap-2 pr-2 text-[11px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                <span>Aperçu en direct</span>
              </div>
            </div>
          </div>

          {/* ── APERÇU DIRECT ET FIDÈLE DU SITE ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Aperçu en direct du site web
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Visualisation fidèle de votre publication publique avec vos modifications en
                  direct.
                </p>
              </div>
            </div>

            <Preview
              name={current.name}
              heroText={current.heroText}
              accentColor={current.accentColor}
              fontFamily={current.fontFamily}
              logoUrl={current.logoUrl}
              headerImageUrl={current.headerImageUrl}
              subdomain={current.subdomain}
              username={current.username}
              navigation={current.navigation}
              socialLinks={current.socialLinks}
              siteOptions={current.siteOptions ?? undefined}
            />
          </div>

          {/* =====================================================================
              POP-UPS MODALES OUVRABLES
              ===================================================================== */}

          {/* MODAL 1 : IDENTITÉ */}
          <Dialog
            open={activeModal === 'identity'}
            onOpenChange={(open) => !open && setActiveModal(null)}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-primary" />
                  <span>1. Identité du site web</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Définissez le titre et le slogan éditorial affichés sur votre publication.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground block">
                    Nom du site web
                  </label>
                  <input
                    type="text"
                    value={current.name || ''}
                    onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex. Le Carnet de Sarah"
                    className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    Titre principal de votre média ou carnet de réflexion.
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground block">
                      Slogan éditorial (Hero Tagline)
                    </label>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {current.heroText?.length || 0}/180 car.
                    </span>
                  </div>
                  <textarea
                    value={current.heroText || ''}
                    onChange={(e) => setCurrent((prev) => ({ ...prev, heroText: e.target.value }))}
                    maxLength={240}
                    placeholder={t`Ex. Réflexions sur la technologie, l'art et l'écriture libre...`}
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    Sous-titre concis décrivant votre ligne éditoriale.
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* MODAL 2 : STYLE & DIRECTION ARTISTIQUE */}
          <Dialog
            open={activeModal === 'style'}
            onOpenChange={(open) => !open && setActiveModal(null)}
          >
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  <Palette className="w-4 h-4 text-primary" />
                  <span>2. Direction artistique & Style</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Personnalisez la typographie et la charte de couleurs de votre publication.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Thème Unique Actif */}
                <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      Thème actif : Éditorial Craft
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                      Actif v1.0
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Design d'auteur épuré type Devouring Details / Rauno, privilégiant le temps long
                    de la lecture.
                  </p>
                  <div className="pt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground border-t border-border/30">
                    <Info className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <span>D'autres thèmes arriveront dans de futures versions.</span>
                  </div>
                </div>

                {/* Polices */}
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <label className="text-xs font-semibold text-foreground block">
                    Police typographique
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SITE_FONTS.map((font) => {
                      const isSelected = (current.fontFamily || 'sans') === font.id;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => setCurrent((prev) => ({ ...prev, fontFamily: font.id }))}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                              : 'border-border/40 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-foreground">
                              {font.name}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <p
                            style={{ fontFamily: font.family }}
                            className="text-xs text-foreground/90 font-medium truncate"
                          >
                            L'art d'écrire en toute liberté.
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Couleur d'accentuation */}
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <label className="text-xs font-semibold text-foreground block">
                    Couleur d'accentuation
                  </label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {ACCENT_SWATCHES.map((swatch) => {
                      const isSelected =
                        current.accentColor?.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          onClick={() =>
                            setCurrent((prev) => ({ ...prev, accentColor: swatch.hex }))
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary shadow-xs'
                              : 'border-border/40 bg-muted/20 hover:bg-muted/50 text-muted-foreground'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                            style={{ backgroundColor: swatch.hex }}
                          />
                          <span>{swatch.name}</span>
                        </button>
                      );
                    })}

                    <div className="flex items-center gap-1.5 pl-1">
                      <input
                        type="color"
                        value={current.accentColor || '#EE4B2B'}
                        onChange={(e) =>
                          setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                        className="w-7 h-7 rounded border border-border/40 cursor-pointer bg-transparent shrink-0"
                      />
                      <input
                        type="text"
                        value={current.accentColor || '#EE4B2B'}
                        onChange={(e) =>
                          setCurrent((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                        className="w-20 px-2 py-1 bg-muted/20 border border-border/40 rounded-lg text-xs font-mono font-medium text-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* MODAL 3 : MÉDIAS */}
          <Dialog
            open={activeModal === 'media'}
            onOpenChange={(open) => !open && setActiveModal(null)}
          >
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  <span>3. Médias & Identité visuelle</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Téléversez votre logo rond et votre bannière panoramique.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Logo / Avatar */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Avatar / Logo du média
                    </label>
                    <span className="text-[11px] text-muted-foreground block mt-0.5">
                      Symbole affiché en haut à gauche et dans les favoris (512x512px recommandé).
                    </span>
                  </div>

                  {/* Choix de la forme : Rond vs Carré */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Forme :</span>
                    <div className="inline-flex p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrent((prev) => ({
                            ...prev,
                            siteOptions: {
                              ...(prev.siteOptions ?? {}),
                              logoShapeSquare: false,
                              logoShape: 'circle',
                            },
                          }))
                        }
                        className={cn(
                          'px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium',
                          !current.siteOptions?.logoShapeSquare &&
                            current.siteOptions?.logoShape !== 'square'
                            ? 'bg-background text-foreground shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Rond
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrent((prev) => ({
                            ...prev,
                            siteOptions: {
                              ...(prev.siteOptions ?? {}),
                              logoShapeSquare: true,
                              logoShape: 'square',
                            },
                          }))
                        }
                        className={cn(
                          'px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium',
                          current.siteOptions?.logoShapeSquare ||
                            current.siteOptions?.logoShape === 'square'
                            ? 'bg-background text-foreground shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Carré
                      </button>
                    </div>
                  </div>

                  <div className="max-w-[130px]">
                    <ImageUploader
                      value={current.logoUrl}
                      onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                      }
                      aspect={1}
                      shape={
                        current.siteOptions?.logoShapeSquare ||
                        current.siteOptions?.logoShape === 'square'
                          ? 'rounded'
                          : 'circle'
                      }
                      maxDimension={512}
                    />
                  </div>
                </div>

                {/* Logo / Wordmark ou Bannière d'en-tête */}
                <div className="space-y-2 pt-3 border-t border-border/30">
                  <div>
                    <label className="text-xs font-semibold text-foreground block">
                      Logo d'en-tête / Wordmark (ou bannière)
                    </label>
                    <span className="text-[11px] text-muted-foreground block mt-0.5">
                      Logotype horizontal ou image d'en-tête affiché en haut de votre publication.
                    </span>
                  </div>
                  <ImageUploader
                    value={current.headerImageUrl}
                    onChange={(url) => setCurrent((prev) => ({ ...prev, headerImageUrl: url }))}
                    upload={(file) =>
                      uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.banners)
                    }
                    aspect={21 / 9}
                    shape="banner"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* MODAL 4 : BLOCS DE PAGE */}
          <Dialog
            open={activeModal === 'blocks'}
            onOpenChange={(open) => !open && setActiveModal(null)}
          >
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <span>4. Composants & Blocs de page</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Activez ou désactivez les blocs affichés sur votre site web public.
                </DialogDescription>
              </DialogHeader>

              <div className="divide-y divide-border/30 py-2">
                {SITE_OPTION_ITEMS.map((item) => {
                  const isEnabled = (current.siteOptions?.[item.key] ?? true) !== false;
                  return (
                    <div
                      key={item.key}
                      className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-0.5">
                        <label
                          htmlFor={`pop-opt-${item.key}`}
                          className="text-xs font-semibold text-foreground cursor-pointer block"
                        >
                          {item.label}
                        </label>
                        <span className="text-[11px] text-muted-foreground block">
                          {item.description}
                        </span>
                      </div>

                      <button
                        type="button"
                        id={`pop-opt-${item.key}`}
                        role="switch"
                        aria-checked={isEnabled}
                        onClick={() => {
                          setCurrent((prev) => {
                            const existing = prev.siteOptions || {};
                            const currentVal = existing[item.key] ?? true;
                            return {
                              ...prev,
                              siteOptions: {
                                ...existing,
                                [item.key]: !currentVal,
                              },
                            };
                          });
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-3 border-t border-border/30">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* =====================================================================
          VUE 2 : PROFIL PUBLIC (MÉDIA OU COMPTE PERSONNEL)
          ===================================================================== */}
      {identityScope === 'core' && (
        <div className="space-y-6">
          {/* Note d'information & Action */}
          {isMedia ? (
            /* Contexte Compte Média : modification directe ici */
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-start justify-between gap-4 text-xs shadow-2xs">
              <div className="flex items-start gap-3 text-muted-foreground leading-relaxed">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground block">
                    Profil public de votre média
                  </span>
                  <p>
                    Ces informations présentent votre média dans l'annuaire et auprès de vos
                    lecteurs. Vous pouvez les modifier directement ici.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal('mediaProfile')}
                className="shrink-0 px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>Modifier le profil</span>
                <PenTool className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Contexte Compte Personnel : redirection vers la page de profil avec mots simples */
            <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex items-start justify-between gap-4 text-xs shadow-2xs">
              <div className="flex items-start gap-3 text-muted-foreground leading-relaxed">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground block">Votre profil</span>
                  <p>
                    Votre profil d'auteur est relié à votre compte personnel. Pour modifier votre
                    nom, votre biographie ou votre photo, rendez-vous sur la page de votre profil.
                  </p>
                </div>
              </div>

              <a
                href={consoleSettingsUrl}
                className="shrink-0 px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span>Modifier mon profil</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* ── MOCKUP / APERÇU DU PROFIL PUBLIC ── */}
          <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-sm">
            {/* Bannière */}
            <div className="w-full h-36 bg-gradient-to-r from-muted via-muted/60 to-muted/30 border-b border-border/30 relative">
              {current.headerImageUrl ? (
                <Image src={current.headerImageUrl} alt="" fill className="object-cover" />
              ) : (
                <div className="absolute inset-0 bg-radial from-transparent to-black/10" />
              )}
            </div>

            {/* En-tête profil : Avatar, Nom, Stats, Actions */}
            <div className="px-6 pb-6 pt-0 relative">
              {/* Avatar positionné à cheval */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
                <div className="flex items-end gap-3.5">
                  <div className="w-20 h-20 rounded-full border-4 border-card bg-muted overflow-hidden relative shadow-md flex items-center justify-center font-bold text-foreground text-xl">
                    {current.logoUrl ? (
                      <Image src={current.logoUrl} alt="" fill className="object-cover" />
                    ) : (
                      (current.name || current.username || (isMedia ? 'M' : 'A'))
                        .charAt(0)
                        .toUpperCase()
                    )}
                  </div>

                  <div className="space-y-0.5 mb-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-base font-bold text-foreground">
                        {current.name || (isMedia ? 'Nom du média' : current.username || 'Auteur')}
                      </h2>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        <span>{isMedia ? 'Média' : 'Auteur'}</span>
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono block">
                      @{current.username || (isMedia ? 'media' : 'auteur')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg border border-border/50 text-xs font-semibold text-muted-foreground bg-muted/20">
                    S'abonner
                  </span>
                  <span className="px-3 py-1.5 rounded-lg border border-border/50 text-xs font-semibold text-muted-foreground bg-muted/20 flex items-center gap-1">
                    <Share2 className="w-3 h-3" />
                  </span>
                </div>
              </div>

              {/* Bio & Métadonnées */}
              <div className="space-y-3 pt-2">
                <p className="text-xs text-foreground/90 leading-relaxed max-w-2xl">
                  {current.heroText ||
                    (isMedia
                      ? "Publication d'information indépendante et espace d'analyses éditoriales."
                      : 'Auteur et essayiste indépendant. Réflexions de fond, indépendance intellectuelle et analyse critique.')}
                </p>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono text-foreground font-medium">
                      {current.subdomain ? `${current.subdomain}.qoe.fi` : 'votre-site.qoe.fi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Inscrit sur le réseau</span>
                  </div>
                </div>

                {/* Métriques / Abonnés */}
                <div className="flex items-center gap-6 pt-3 border-t border-border/30 text-xs">
                  <div>
                    <strong className="text-foreground font-bold">128</strong>{' '}
                    <span className="text-muted-foreground">abonnés</span>
                  </div>
                  <div>
                    <strong className="text-foreground font-bold">42</strong>{' '}
                    <span className="text-muted-foreground">abonnements</span>
                  </div>
                  <div>
                    <strong className="text-foreground font-bold">14</strong>{' '}
                    <span className="text-muted-foreground">écrits publiés</span>
                  </div>
                </div>
              </div>

              {/* Onglets du profil */}
              <div className="flex gap-6 border-b border-border/30 mt-6 text-xs font-semibold">
                <span className="pb-2.5 border-b-2 border-primary text-foreground cursor-pointer">
                  Articles (14)
                </span>
                <span className="pb-2.5 border-b-2 border-transparent text-muted-foreground cursor-pointer hover:text-foreground">
                  Pensées (32)
                </span>
                <span className="pb-2.5 border-b-2 border-transparent text-muted-foreground cursor-pointer hover:text-foreground">
                  Recommandations
                </span>
              </div>

              {/* Exemple de contenu publié */}
              <div className="pt-5 space-y-4">
                <article className="p-4 rounded-xl bg-muted/20 border border-border/30 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span className="font-semibold text-foreground uppercase">Article</span>
                    <span>·</span>
                    <span>Hier</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    L'autonomie de publication à l'ère des réseaux centralisés
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    Pourquoi préserver son propre nom de domaine et fédérer son audience directement
                    sans dépendre d'un algorithme opaque constitue l'avenir des médias indépendants.
                  </p>
                  <div className="flex items-center gap-4 pt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> 8 réponses
                    </span>
                    <span className="flex items-center gap-1">
                      <Bookmark className="w-3 h-3" /> Sauvegardé
                    </span>
                  </div>
                </article>
              </div>
            </div>
          </div>

          {/* MODAL SPÉCIFIQUE : MODIFICATION DU PROFIL DU MÉDIA */}
          {isMedia && (
            <Dialog
              open={activeModal === 'mediaProfile'}
              onOpenChange={(open) => !open && setActiveModal(null)}
            >
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-sm font-bold flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-primary" />
                    <span>Modifier le profil du média</span>
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Ces informations présentent votre média dans l'annuaire et auprès de vos
                    lecteurs.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      Nom public du média
                    </label>
                    <input
                      type="text"
                      value={current.name || ''}
                      onChange={(e) => setCurrent((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex. Le Monde Diplomatique"
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-border/30">
                    <label className="text-xs font-semibold text-foreground block">
                      Description du média
                    </label>
                    <textarea
                      value={current.heroText || ''}
                      onChange={(e) =>
                        setCurrent((prev) => ({ ...prev, heroText: e.target.value }))
                      }
                      rows={3}
                      placeholder="Description de la ligne éditoriale du média..."
                      className="w-full px-3.5 py-2.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/80 resize-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <label className="text-xs font-semibold text-foreground block">
                      Logo du média
                    </label>
                    <div className="max-w-[120px]">
                      <ImageUploader
                        value={current.logoUrl}
                        onChange={(url) => setCurrent((prev) => ({ ...prev, logoUrl: url }))}
                        upload={(file) =>
                          uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.avatars)
                        }
                        aspect={1}
                        shape="circle"
                        maxDimension={512}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    Valider
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}
