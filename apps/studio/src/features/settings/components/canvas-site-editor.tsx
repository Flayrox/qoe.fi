'use client';

// =====================================================================
// 🦄 CanvasSiteEditor — Atelier Visuel On-Canvas (Licorne 2026)
// =====================================================================
// Permet au créateur de sculpter son site web souverain (*.qoe.fi)
// directement sur la maquette vivante (Wix Studio / Framer standard).
//
// Fonctionnalités clés :
// 1. Studio Dock : Viewport Switcher (Desktop 💻 / Tablette 📱 / Mobile 📱)
// 2. Styles Signatures : Presets éditoriaux 1-Clic
// 3. Édition Inline directe : Titre & Slogan sans saut de mise en page
// 4. Bannière Panoramique : Glisser-déposer d'image natif + téléversement direct
// 5. Palette Ancrée : Swatches signatures Qoefi + Pipette Eyedropper native
// 6. Typographie en Direct : Inter, Outfit, Space Grotesk, Playfair Display
// 7. Inspecteur Rétractable : Contrôle numérique & isolation du compte
// 100% Theme-Agnostic Semantic Tokens (@qoe/theme). Zero raw Tailwind colors.
// =====================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  Palette,
  Type,
  ImageIcon,
  UploadCloud,
  Trash2,
  ExternalLink,
  SlidersHorizontal,
  RotateCcw,
  Check,
  Plus,
  Globe,
  Pipette,
  Loader2,
  Info,
  X,
  BookOpen,
} from 'lucide-react';
import type { CreatorProfile } from './publication-settings';

// Familles de polices éditoriales supportées
export const FONT_OPTIONS = [
  { id: 'sans', name: 'Inter', category: 'Sans-serif Épuré', family: "'Inter', sans-serif" },
  { id: 'outfit', name: 'Outfit', category: 'Moderne Géométrique', family: "'Outfit', sans-serif" },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    category: 'Brutaliste Tech',
    family: "'Space Grotesk', sans-serif",
  },
  {
    id: 'serif',
    name: 'Playfair Display',
    category: 'Littéraire Prestige',
    family: "'Playfair Display', serif",
  },
];

// Nuancier signature Qoefi
export const SWATCH_PALETTE = [
  { id: 'vermilion', name: 'Vermillon', hex: '#EE4B2B' },
  { id: 'emerald', name: 'Émeraude', hex: '#10B981' },
  { id: 'royal', name: 'Bleu Royal', hex: '#3B82F6' },
  { id: 'orchid', name: 'Orchidée', hex: '#D946EF' },
  { id: 'amber', name: 'Ambre', hex: '#F59E0B' },
  { id: 'charcoal', name: 'Anthracite', hex: '#3F3F46' },
];

// Presets éditoriaux « Styles Signatures » en 1-Clic
export const EDITORIAL_PRESETS = [
  {
    id: 'diplo',
    name: 'Le Monde Diplomatique',
    description: 'Typographie prestige & bordeaux profond',
    fontId: 'serif',
    accentColor: '#EE4B2B',
  },
  {
    id: 'verge',
    name: 'The Verge & Wired',
    description: 'Brutalisme technologique & bleu royal',
    fontId: 'space-grotesk',
    accentColor: '#3B82F6',
  },
  {
    id: 'substack',
    name: 'Substack Minimal',
    description: 'Sobriété éditoriale & noir anthracite',
    fontId: 'sans',
    accentColor: '#3F3F46',
  },
  {
    id: 'monocle',
    name: 'Monocle Journal',
    description: 'Élégance scandinave & vert émeraude',
    fontId: 'outfit',
    accentColor: '#10B981',
  },
];

interface CanvasSiteEditorProps {
  current: CreatorProfile;
  onChange: (updater: (prev: CreatorProfile) => CreatorProfile) => void;
  onReset: () => void;
  hasChanges: boolean;
  publicBlogUrl: string;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export function CanvasSiteEditor({
  current,
  onChange,
  onReset,
  hasChanges,
  publicBlogUrl,
}: CanvasSiteEditorProps) {
  // ── 1. État local de l'atelier ──────────────────────────────────────
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [isFontPopoverOpen, setIsFontPopoverOpen] = useState(false);
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDraggingOverBanner, setIsDraggingOverBanner] = useState(false);

  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const taglineTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeFont =
    FONT_OPTIONS.find((f) => f.id === current.fontFamily)?.family || "'Inter', sans-serif";
  const activeColor = current.accentColor || '#EE4B2B';
  const displayName = current.name?.trim() || 'Mon Site Web';
  const displayHero =
    current.heroText?.trim() ||
    'Un espace dédié aux analyses indépendantes, aux écrits de fond et aux idées.';

  // Auto-ajustement de la hauteur du textarea du slogan
  const adjustTextareaHeight = useCallback(() => {
    if (taglineTextareaRef.current) {
      taglineTextareaRef.current.style.height = 'auto';
      taglineTextareaRef.current.style.height = `${taglineTextareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [current.heroText, adjustTextareaHeight, viewport]);

  // ── 2. Gestion de l'upload d'images ────────────────────────────────
  const handleBannerUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Le fichier doit être une image valide (JPG, PNG, WebP).');
      return;
    }
    setIsUploadingBanner(true);
    try {
      const publicUrl = await uploadImageToRoute(
        file,
        '/api/articles/upload',
        IMAGE_FOLDERS.banners
      );
      onChange((prev) => ({ ...prev, headerImageUrl: publicUrl }));
      toast.success('Bannière de couverture mise à jour ! ✨');
    } catch {
      toast.error('Échec du téléversement de la bannière.');
    } finally {
      setIsUploadingBanner(false);
      setIsDraggingOverBanner(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Le fichier doit être une image valide.');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const publicUrl = await uploadImageToRoute(
        file,
        '/api/articles/upload',
        IMAGE_FOLDERS.avatars
      );
      onChange((prev) => ({ ...prev, logoUrl: publicUrl }));
      toast.success('Logo du site mis à jour ! 🎨');
    } catch {
      toast.error('Échec du téléversement du logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Support Eyedropper API natif 2026
  const handleEyeDropper = async () => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        // @ts-expect-error EyeDropper est une API navigateur standard moderne
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          onChange((prev) => ({ ...prev, accentColor: result.sRGBHex }));
          toast.success(`Couleur sélectionnée : ${result.sRGBHex}`);
        }
      } catch {
        // Annulation de la pipette par l'utilisateur
      }
    } else {
      toast.info('La pipette nécessite un navigateur compatible Chromium/Safari.');
    }
  };

  // Application d'un style signature en 1 clic
  const applyPreset = (preset: (typeof EDITORIAL_PRESETS)[0]) => {
    onChange((prev) => ({
      ...prev,
      fontFamily: preset.fontId,
      accentColor: preset.accentColor,
    }));
    setIsPresetMenuOpen(false);
    toast.success(`Style « ${preset.name} » appliqué ! 🎩`);
  };

  // Ajout rapide d'un lien de navigation
  const handleAddNavigationItem = () => {
    const label = window.prompt("Nom de l'onglet à ajouter (ex: À propos, Dossiers) :");
    if (!label?.trim()) return;
    const url = window.prompt(
      'Lien de destination (URL relative ou absolue) :',
      `/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    );

    const newNav = [
      ...current.navigation,
      {
        label: label.trim(),
        url: url?.trim() || null,
        order: current.navigation.length,
        isExternal: (url || '').startsWith('http'),
      },
    ];
    onChange((prev) => ({ ...prev, navigation: newNav }));
    toast.success(`Onglet « ${label.trim()} » ajouté à la navigation !`);
  };

  return (
    <div className="w-full space-y-6">
      {/* =====================================================================
          1. FLOATING STUDIO DOCK (BARRE D'OUTILS PRINCIPALE)
          ===================================================================== */}
      <div className="w-full flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-2xl border border-border/60 bg-card/90 backdrop-blur-md shadow-xs sticky top-20 z-30">
        {/* Gauche : Sélecteur de Viewport (Desktop / Tablette / Mobile) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            title="Vue Ordinateur (Desktop 100%)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewport === 'desktop'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ordinateur</span>
          </button>

          <button
            type="button"
            onClick={() => setViewport('tablet')}
            title="Vue Tablette (768px)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewport === 'tablet'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tablette</span>
          </button>

          <button
            type="button"
            onClick={() => setViewport('mobile')}
            title="Vue Smartphone (390px)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewport === 'mobile'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobile</span>
          </button>
        </div>

        {/* Centre : Outils rapides (Styles Signatures & Typo) */}
        <div className="flex items-center gap-2">
          {/* Dropdown Styles Signatures */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPresetMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Styles Signatures</span>
            </button>

            <AnimatePresence>
              {isPresetMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 p-2 rounded-2xl bg-card border border-border/80 shadow-xl z-50 space-y-1.5"
                >
                  <div className="px-3 py-1.5 border-b border-border/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Presets éditoriaux 1-Clic
                    </span>
                  </div>
                  {EDITORIAL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="w-full p-2.5 rounded-xl text-left hover:bg-muted/50 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.accentColor }}
                          />
                          <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                            {p.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {p.description}
                        </p>
                      </div>
                      {current.fontFamily === p.fontId && current.accentColor === p.accentColor && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sélecteur de typographie rapide */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFontPopoverOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground text-xs font-medium transition-all cursor-pointer"
            >
              <Type className="w-3.5 h-3.5 text-muted-foreground" />
              <span
                style={{ fontFamily: activeFont }}
                className="font-semibold truncate max-w-[100px]"
              >
                {FONT_OPTIONS.find((f) => f.id === current.fontFamily)?.name || 'Inter'}
              </span>
            </button>

            <AnimatePresence>
              {isFontPopoverOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-2 w-64 p-2 rounded-2xl bg-card border border-border/80 shadow-xl z-50 space-y-1"
                >
                  <div className="px-3 py-1.5 border-b border-border/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Police éditoriale du site
                    </span>
                  </div>
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onChange((prev) => ({ ...prev, fontFamily: f.id }));
                        setIsFontPopoverOpen(false);
                        toast.success(`Police changée pour ${f.name}`);
                      }}
                      className="w-full p-2.5 rounded-xl text-left hover:bg-muted/50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div>
                        <span
                          style={{ fontFamily: f.family }}
                          className="text-sm font-bold text-foreground block"
                        >
                          {f.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{f.category}</span>
                      </div>
                      {current.fontFamily === f.id && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Palette d'accentuation rapide */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColorPopoverOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground text-xs font-medium transition-all cursor-pointer"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-border/60 shrink-0"
                style={{ backgroundColor: activeColor }}
              />
              <span className="font-mono text-xs hidden sm:inline">{activeColor}</span>
            </button>

            <AnimatePresence>
              {isColorPopoverOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-2 w-72 p-3 rounded-2xl bg-card border border-border/80 shadow-xl z-50 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Couleur d'accentuation
                    </span>
                    <button
                      type="button"
                      onClick={handleEyeDropper}
                      title="Prélever une couleur sur l'écran"
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Pipette className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Nuances Qoefi */}
                  <div className="grid grid-cols-6 gap-2">
                    {SWATCH_PALETTE.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() => {
                          onChange((prev) => ({ ...prev, accentColor: swatch.hex }));
                        }}
                        title={swatch.name}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-2xs border border-border/40 relative"
                        style={{ backgroundColor: swatch.hex }}
                      >
                        {activeColor.toLowerCase() === swatch.hex.toLowerCase() && (
                          <Check className="w-4 h-4 text-white stroke-[2.5]" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Saisie Hexadécimale personnalisée */}
                  <div className="pt-2 border-t border-border/40 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">HEX</span>
                    <input
                      type="text"
                      value={current.accentColor || ''}
                      onChange={(e) =>
                        onChange((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      placeholder="#EE4B2B"
                      className="flex-1 px-2.5 py-1 text-xs font-mono bg-muted/30 border border-border/60 rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Droite : Réinitialiser & Inspecteur Toggle */}
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={onReset}
              title="Annuler les modifications non enregistrées"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rétablir</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsInspectorOpen((prev) => !prev)}
            title="Ouvrir le panneau inspecteur"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isInspectorOpen
                ? 'border-primary bg-primary/10 text-primary shadow-2xs'
                : 'border-border/60 bg-muted/30 hover:bg-muted/60 text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Inspecteur</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. ZONE DE TRAVAIL CENTRALE (CANVAS + TIROIR INSPECTEUR OPTIONNEL)
          ===================================================================== */}
      <div className="flex items-start gap-6 relative">
        {/* ── LE CANVAS VIVANT (ADAPTATIF AU VIEWPORT) ── */}
        <div
          className={`flex-1 mx-auto transition-all duration-300 ${
            viewport === 'desktop'
              ? 'w-full'
              : viewport === 'tablet'
                ? 'max-w-[768px]'
                : 'max-w-[390px]'
          }`}
        >
          {/* Cadre de l'appareil (Bezel pour tablette et mobile) */}
          <div
            className={`rounded-3xl border border-border/70 bg-card overflow-hidden shadow-xl transition-all duration-300 ${
              viewport !== 'desktop' ? 'ring-8 ring-muted/50 p-1 bg-muted/20' : ''
            }`}
          >
            {/* Barre de statut du simulateur de navigateur */}
            <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground select-none">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-primary/80 inline-block" />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-md bg-background/80 border border-border/40 text-[11px] font-mono text-muted-foreground max-w-[280px] truncate">
                <Globe className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate">
                  {current.subdomain ? `${current.subdomain}.qoe.fi` : 'mon-site.qoe.fi'}
                </span>
              </div>
              <a
                href={publicBlogUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le vrai site web dans un nouvel onglet"
                className="hover:text-foreground transition-colors p-1"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* ═════════════════════════════════════════════════════════════
                MAQUETTE DU TENANT (100% INTERACTIVE SUR LE CANVAS)
                ═════════════════════════════════════════════════════════════ */}
            <div className="bg-background text-foreground min-h-[640px] flex flex-col justify-between">
              {/* ── TENANT HEADER NAVIGATION BAR ── */}
              <div className="px-6 py-4 border-b border-border/40 bg-background/90 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between gap-4">
                {/* Logo & Nom du Site (Cliquables) */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Logo avec support d'upload direct au clic */}
                  <div
                    onClick={() => logoFileInputRef.current?.click()}
                    title="Cliquez pour changer le logo"
                    className="relative w-8 h-8 rounded-xl overflow-hidden bg-muted border border-border/60 hover:ring-2 hover:ring-primary transition-all cursor-pointer shrink-0 group"
                  >
                    {current.logoUrl ? (
                      <Image
                        src={current.logoUrl}
                        alt={displayName}
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: activeColor }}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-2xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      {isUploadingLogo ? (
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                      ) : (
                        <Palette className="w-3.5 h-3.5 text-foreground" />
                      )}
                    </div>
                  </div>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                  />

                  {/* Nom du site en header */}
                  <span
                    style={{ fontFamily: activeFont }}
                    className="text-sm font-bold text-foreground truncate select-none tracking-tight"
                  >
                    {displayName}
                  </span>
                </div>

                {/* Liens de navigation avec bouton d'ajout interactif */}
                <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-muted-foreground">
                  {current.navigation.length > 0 ? (
                    current.navigation.slice(0, 4).map((item, idx) => (
                      <span
                        key={idx}
                        className="hover:text-foreground cursor-pointer truncate max-w-[100px] transition-colors"
                      >
                        {item.label}
                      </span>
                    ))
                  ) : (
                    <>
                      <span className="text-foreground font-semibold">Articles</span>
                      <span className="hover:text-foreground cursor-pointer">À propos</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleAddNavigationItem}
                    title="Ajouter un onglet au menu"
                    className="p-1 rounded-md bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Bouton S'abonner (ouvre le nuancier d'accent au clic) */}
                <button
                  type="button"
                  onClick={() => setIsColorPopoverOpen((prev) => !prev)}
                  title="Cliquez pour changer la couleur d'accentuation"
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer shrink-0 select-none group flex items-center gap-1.5"
                  style={{ backgroundColor: activeColor }}
                >
                  <span>S'abonner</span>
                  <Palette className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>

              {/* ── BANNIÈRE PANORAMIQUE AVEC DRAG & DROP ── */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOverBanner(true);
                }}
                onDragLeave={() => setIsDraggingOverBanner(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleBannerUpload(file);
                }}
                className={`relative w-full aspect-21/9 min-h-[160px] sm:min-h-[220px] bg-muted/30 border-b border-border/40 overflow-hidden flex items-center justify-center transition-all group ${
                  isDraggingOverBanner ? 'ring-4 ring-primary bg-primary/10' : ''
                }`}
              >
                {current.headerImageUrl ? (
                  <>
                    <Image
                      src={current.headerImageUrl}
                      alt="Couverture"
                      fill
                      className="object-cover"
                      sizes="1200px"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background z-10" />
                  </>
                ) : (
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      background: `radial-gradient(circle at center, ${activeColor}55 0%, transparent 75%)`,
                    }}
                  />
                )}

                {/* Pilule d'action flottante sur la bannière */}
                <div className="absolute top-4 right-4 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    type="button"
                    onClick={() => bannerFileInputRef.current?.click()}
                    disabled={isUploadingBanner}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background/90 hover:bg-background text-foreground border border-border/60 backdrop-blur-md text-xs font-semibold shadow-md transition-all cursor-pointer"
                  >
                    {isUploadingBanner ? (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span>{current.headerImageUrl ? 'Changer' : 'Ajouter une couverture'}</span>
                  </button>

                  {current.headerImageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange((prev) => ({ ...prev, headerImageUrl: null }));
                        toast.info('Bannière retirée.');
                      }}
                      title="Supprimer la bannière"
                      className="p-1.5 rounded-xl bg-background/90 hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border/60 backdrop-blur-md shadow-md transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <input
                  ref={bannerFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleBannerUpload(file);
                  }}
                />

                {/* Indication Drag & Drop au survol si vide */}
                {!current.headerImageUrl && (
                  <div className="z-10 text-center p-4 space-y-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <UploadCloud className="w-6 h-6 mx-auto text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground block">
                      Glissez une image ici ou cliquez pour choisir une couverture
                    </span>
                  </div>
                )}
              </div>

              {/* ── GRAND HERO ÉDITORIAL (ÉDITION INLINE DU TITRE & DU SLOGAN) ── */}
              <div className="px-6 py-10 sm:py-14 text-center flex flex-col items-center justify-center max-w-3xl mx-auto w-full space-y-4">
                {/* 1. Titre du Site Web (Édition Inline Directe) */}
                <div className="w-full relative group">
                  <input
                    type="text"
                    value={current.name || ''}
                    onChange={(e) => onChange((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nom de votre site web..."
                    style={{ fontFamily: activeFont }}
                    className="w-full bg-transparent border-0 text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground text-center focus:outline-none placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/40 rounded-2xl p-2 transition-all"
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
                    ✏️ Titre principal (cliquez pour éditer)
                  </span>
                </div>

                {/* 2. Slogan Hero / Tagline (Édition Inline Directe) */}
                <div className="w-full relative group max-w-xl">
                  <textarea
                    ref={taglineTextareaRef}
                    rows={2}
                    value={current.heroText || ''}
                    onChange={(e) => {
                      onChange((prev) => ({ ...prev, heroText: e.target.value }));
                      adjustTextareaHeight();
                    }}
                    placeholder={displayHero}
                    className="w-full bg-transparent border-0 text-sm sm:text-base md:text-lg text-muted-foreground text-center resize-none leading-relaxed focus:outline-none placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/30 rounded-2xl p-2 transition-all"
                  />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity block mt-1">
                    ✏️ Slogan éditorial (cliquez pour éditer)
                  </span>
                </div>

                {/* Liens Sociaux */}
                {current.socialLinks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-muted-foreground text-xs">
                    {current.socialLinks.map((s) => (
                      <span
                        key={s.platform}
                        className="px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 capitalize text-[11px]"
                      >
                        {s.platform}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── FLUX D'ARTICLES RÉELS OU ÉDITORIAUX EN DIRECT ── */}
              <div className="px-6 py-8 border-t border-border/30 bg-muted/10 space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground max-w-3xl mx-auto w-full">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    <span>Derniers articles publiés</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">Flux souverain</span>
                </div>

                <div className="max-w-3xl mx-auto w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {current.articles.length > 0 ? (
                    current.articles.slice(0, 2).map((art) => (
                      <div
                        key={art.id}
                        className="p-4 rounded-2xl border border-border/50 bg-card/80 shadow-2xs space-y-2 hover:border-border transition-colors"
                      >
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider block"
                          style={{ color: activeColor }}
                        >
                          Édition
                        </span>
                        <h4
                          style={{ fontFamily: activeFont }}
                          className="text-sm font-bold text-foreground line-clamp-2"
                        >
                          {art.title}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {art.content
                            ? art.content.slice(0, 100).replace(/<[^>]*>/g, '')
                            : 'Contenu rédigé par l’auteur...'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl border border-border/50 bg-card/80 shadow-2xs space-y-2">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider block"
                          style={{ color: activeColor }}
                        >
                          Analyse & Fond
                        </span>
                        <h4
                          style={{ fontFamily: activeFont }}
                          className="text-sm font-bold text-foreground"
                        >
                          Pourquoi la souveraineté éditoriale redéfinit le web
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Un espace indépendant permet aux auteurs de garder le contrôle direct sur
                          leur audience et leur distribution...
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl border border-border/50 bg-card/80 shadow-2xs space-y-2">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider block"
                          style={{ color: activeColor }}
                        >
                          Enquête
                        </span>
                        <h4
                          style={{ fontFamily: activeFont }}
                          className="text-sm font-bold text-foreground"
                        >
                          L'économie de l'attention face aux newsletters curatées
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Comment les créateurs contournent les algorithmes des plateformes pour
                          créer un lien de confiance durable...
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Footer du site */}
              <div className="px-6 py-4 border-t border-border/30 text-center text-xs text-muted-foreground">
                <span>
                  © {new Date().getFullYear()} {displayName} • Propulsé par Qoefi
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. TIROIR INSPECTEUR RÉTRACTABLE (LATÉRAL DROIT) ── */}
        <AnimatePresence>
          {isInspectorOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 340 }}
              exit={{ opacity: 0, x: 20, width: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 rounded-3xl border border-border/60 bg-card p-5 space-y-5 shadow-lg overflow-y-auto max-h-[820px] sticky top-20"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Inspecteur du Site
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInspectorOpen(false)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Rappel d'isolation souveraine */}
              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-xs text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  Site Web Souverain
                </span>
                <p className="text-[11px] leading-relaxed">
                  Ces réglages s'appliquent uniquement à votre site{' '}
                  <strong className="text-foreground">{current.subdomain}.qoe.fi</strong>. Votre
                  compte lecteur reste strictement séparé.
                </p>
              </div>

              {/* Compteurs numériques */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Titre du site</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {current.name?.length || 0} car.
                    </span>
                  </div>
                  <input
                    type="text"
                    value={current.name || ''}
                    onChange={(e) => onChange((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Slogan (Hero)</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {current.heroText?.length || 0}/180 car.
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={current.heroText || ''}
                    onChange={(e) => onChange((prev) => ({ ...prev, heroText: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-muted/20 border border-border/40 rounded-lg text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-foreground block">Couleur HEX</span>
                  <input
                    type="text"
                    value={current.accentColor || ''}
                    onChange={(e) => onChange((prev) => ({ ...prev, accentColor: e.target.value }))}
                    className="w-full px-3 py-1.5 bg-muted/20 border border-border/40 rounded-lg text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Navigation rapide vers autres onglets */}
              <div className="pt-4 border-t border-border/40 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Configuration Avancée
                </span>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pour configurer les domaines DNS personnalisés, les modèles d'emails ou le SEO
                  Auto-Pilot, utilisez les onglets situés en haut de page.
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
