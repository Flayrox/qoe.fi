'use client';

// =====================================================================
// 🦄 FigmaStudioClient.tsx — Atelier Design Studio Plein Écran (Licorne 2026)
// =====================================================================
// Fournit une expérience de conception visuelle de grade mondial (Figma/Linear/Framer).
//
// Poussé au MAX :
// 1. Splash Loader Signature Qoefi : Boot soyeux avec halo vermillon et verre dépoli
// 2. Tiroir Global Studio : Permet de basculer vers les autres sections (Articles, Stats)
// 3. Dock Supérieur : Switcher Viewport (Bureau, Tablette, Mobile), Zoom, Undo/Redo, Sauvegarde
// 4. Panneau Gauche (Calques) : Arborescence vivante des blocs, réordonnancement, visibilité
// 5. Catalogue de Sections : Modal d'ajout de blocs (Bento, Lead Story, Newsletter, etc.)
// 6. Canevas Central Réactif : Simulation matérielle fidèle et sélection directe au clic
// 7. Panneau Droit (Inspecteur) : Contrôles chirurgicaux par bloc ou Tokens Globaux
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@qoe/ui/toast';
import {
  TemplateRenderer,
  parseLayoutConfig,
  serializeLayoutConfig,
  ARCHETYPES_REGISTRY,
  type LayoutConfig,
  type TemplateBlock,
  type BlockType,
  type CardCornerShape,
  type DensityMode,
  type TemplatePublicationContext,
  type TemplateArticleItem,
} from '@qoe/ui/templates';
import { updateCreatorProfileAction } from '@qoe/sdk/actions/dashboard';
import {
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  RotateCw,
  Menu,
  X,
  ExternalLink,
  Check,
  Loader2,
  Grid,
  FileText,
  Mail,
  Layout,
  SlidersHorizontal,
  Compass,
  ArrowLeft,
} from 'lucide-react';

// Nuancier signature Qoefi
const SWATCH_PALETTE = [
  { id: 'vermilion', name: 'Vermillon', hex: '#EE4B2B' },
  { id: 'emerald', name: 'Émeraude', hex: '#10B981' },
  { id: 'sapphire', name: 'Saphir', hex: '#3B82F6' },
  { id: 'amber', name: 'Ambre', hex: '#F59E0B' },
  { id: 'amethyst', name: 'Améthyste', hex: '#8B5CF6' },
  { id: 'obsidian', name: 'Obsidienne', hex: '#18181B' },
];

// Polices supportées
const FONT_OPTIONS = [
  { id: 'sans', name: 'Inter', category: 'Sans-serif Épuré' },
  { id: 'outfit', name: 'Outfit', category: 'Moderne Géométrique' },
  { id: 'serif', name: 'Playfair Display', category: 'Littéraire Prestige' },
  { id: 'space-grotesk', name: 'Space Grotesk', category: 'Brutaliste Tech' },
];

// Catalogue des blocs ajoutables
const BLOCK_CATALOG: {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    type: 'bento-grid',
    label: 'Mosaïque Bento',
    description: 'Grille asymétrique moderne mettant en valeur 3 ou 4 articles clés.',
    icon: Grid,
  },
  {
    type: 'lead-story',
    label: 'Article Vedette (À la Une)',
    description: 'Grand format immersif avec ratio cinéma (21:9 ou 16:9).',
    icon: FileText,
  },
  {
    type: 'newsletter-wall',
    label: 'Mur d’Abonnement',
    description: 'Carte d’acquisition de lecteurs avec social proof et halo lumineux.',
    icon: Mail,
  },
  {
    type: 'article-stream',
    label: 'Flux de Publications',
    description: 'Liste ou grille ordonnée de tous les écrits du site.',
    icon: Layout,
  },
  {
    type: 'hero',
    label: 'Bannière Panoramique',
    description: 'En-tête de bienvenue avec titre, slogan et image de couverture.',
    icon: Sparkles,
  },
];

interface FigmaStudioClientProps {
  publication: TemplatePublicationContext;
  articles?: TemplateArticleItem[];
}

export function FigmaStudioClient({ publication, articles = [] }: FigmaStudioClientProps) {
  // 1. Écran de chargement splash
  const [isBooting, setIsBooting] = useState(true);

  // 2. État du tiroir de navigation global
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);

  // 3. Modal catalogue de blocs
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  // 4. Viewport actif
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // 5. AST & Historique Undo/Redo
  const [config, setConfig] = useState<LayoutConfig>(() =>
    parseLayoutConfig(publication.themeMode ? null : null, {
      accentColor: publication.accentColor,
      fontFamily: publication.fontFamily,
    })
  );

  const [history, setHistory] = useState<LayoutConfig[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 6. Bloc sélectionné pour l'inspecteur
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Initialisation avec layoutStyle de la publication
  useEffect(() => {
    const rawLayoutStyle = (publication as { layoutStyle?: string | null }).layoutStyle;
    const initial = parseLayoutConfig(rawLayoutStyle, {
      accentColor: publication.accentColor,
      fontFamily: publication.fontFamily,
    });
    setConfig(initial);
    setHistory([initial]);
    setHistoryIndex(0);

    // Simulation de boot splash silky (450ms)
    const timer = setTimeout(() => {
      setIsBooting(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [publication]);

  // Mutation d'état avec historique
  const updateConfigWithHistory = useCallback(
    (newConfig: LayoutConfig) => {
      setConfig(newConfig);
      setHasUnsavedChanges(true);
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        return [...next, newConfig];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  // Annuler (Undo)
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setConfig(history[prevIndex]);
      setHistoryIndex(prevIndex);
      setHasUnsavedChanges(true);
    }
  };

  // Rétablir (Redo)
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setConfig(history[nextIndex]);
      setHistoryIndex(nextIndex);
      setHasUnsavedChanges(true);
    }
  };

  // Sauvegarde globale vers PostgreSQL via Server Action
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const serialized = serializeLayoutConfig(config);
      await updateCreatorProfileAction({
        layoutStyle: serialized,
        accentColor: config.tokens.accentColor,
        fontFamily: config.tokens.fontFamily,
      });
      setHasUnsavedChanges(false);
      toast.success('Site web souverain enregistré et synchronisé !');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  // Raccourci clavier ⌘S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving) {
          handleSave();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, isSaving, historyIndex, history]);

  // Manipulations des blocs
  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    const blocks = [...config.blocks];
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = blocks[index];
      blocks[index] = blocks[index - 1];
      blocks[index - 1] = temp;
      updateConfigWithHistory({ ...config, blocks });
    } else if (direction === 'down' && index < blocks.length - 1) {
      const temp = blocks[index];
      blocks[index] = blocks[index + 1];
      blocks[index + 1] = temp;
      updateConfigWithHistory({ ...config, blocks });
    }
  };

  const handleToggleBlockVisibility = (blockId: string) => {
    const blocks = config.blocks.map((b) => (b.id === blockId ? { ...b, visible: !b.visible } : b));
    updateConfigWithHistory({ ...config, blocks });
  };

  const handleDeleteBlock = (blockId: string) => {
    const blocks = config.blocks.filter((b) => b.id !== blockId);
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    updateConfigWithHistory({ ...config, blocks });
    toast.info('Section retirée du canevas');
  };

  const handleAddBlock = (type: BlockType, label: string) => {
    const newId = `block_${type}_${Date.now()}`;
    const newBlock: TemplateBlock = {
      id: newId,
      type,
      label,
      visible: true,
      locked: false,
      props: {},
    };

    // Insérer juste avant le footer si présent
    const blocks = [...config.blocks];
    const footerIndex = blocks.findIndex((b) => b.type === 'footer');
    if (footerIndex !== -1) {
      blocks.splice(footerIndex, 0, newBlock);
    } else {
      blocks.push(newBlock);
    }

    updateConfigWithHistory({ ...config, blocks });
    setSelectedBlockId(newId);
    setIsCatalogOpen(false);
    toast.success(`Section « ${label} » ajoutée.`);
  };

  const handleApplyArchetype = (archetypeId: string) => {
    const preset = ARCHETYPES_REGISTRY[archetypeId];
    if (!preset) return;
    const nextConfig: LayoutConfig = {
      ...preset,
      tokens: {
        ...preset.tokens,
        accentColor: config.tokens.accentColor, // Conserver la couleur
      },
    };
    updateConfigWithHistory(nextConfig);
    toast.success(`Archétype « ${archetypeId} » appliqué avec succès.`);
  };

  const selectedBlock = config.blocks.find((b) => b.id === selectedBlockId);

  // Largeur du conteneur de canevas selon le viewport
  const viewportWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] min-h-[844px] shadow-2xl rounded-[40px] border-[8px] border-border/80'
      : viewport === 'tablet'
        ? 'w-[768px] min-h-[1024px] shadow-2xl rounded-2xl border border-border/80'
        : 'w-full max-w-[1360px] shadow-xl rounded-xl border border-border/60';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col h-screen w-screen overflow-hidden select-none font-sans">
      {/* 1. Splash Loader de Démarrage */}
      <AnimatePresence>
        {isBooting && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl"
          >
            <div className="relative flex flex-col items-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden animate-pulse"
                style={{ backgroundColor: config.tokens.accentColor }}
              >
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <p className="mt-6 text-base font-bold text-foreground">
                Chargement de l'Atelier Design Qoefi
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Calibrage des tokens et du canevas temps réel...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Tiroir Global Studio Navigation (Slide-in) */}
      <AnimatePresence>
        {isNavDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNavDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 z-50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="absolute top-0 bottom-0 left-0 w-80 bg-card border-r border-border z-50 p-6 flex flex-col justify-between shadow-2xl"
            >
              <div>
                <div className="flex items-center justify-between pb-6 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: config.tokens.accentColor }}
                    >
                      Q
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">Menu Studio</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                        {publication.name || 'Mon Site Web'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNavDrawerOpen(false)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <nav className="mt-6 space-y-1.5">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Layout className="w-4 h-4" />
                    <span>Tableau de bord</span>
                  </Link>
                  <Link
                    href="/articles"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Articles & Publications</span>
                  </Link>
                  <Link
                    href="/analytics"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Statistiques & Audience</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground bg-muted/60 transition-colors"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Réglages du Site</span>
                  </Link>
                </nav>
              </div>

              <div className="pt-6 border-t border-border">
                <Link
                  href="/settings"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-all"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Quitter l'Atelier Design</span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 3. Dock Supérieur (Topbar) */}
      <header className="h-14 border-b border-border bg-card/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-40">
        {/* Navigation & Titre */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsNavDrawerOpen(true)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
            title="Ouvrir le menu studio"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-semibold">Menu Studio</span>
          </button>

          <div className="h-4 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-foreground">Atelier Design</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
              {config.archetype.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Centre : Sélecteur de Viewport & Zoom */}
        <div className="flex items-center gap-1 bg-muted/80 p-1 rounded-xl border border-border/40">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewport === 'desktop'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vue Bureau"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewport === 'tablet'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vue Tablette"
          >
            <Tablet className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
              viewport === 'mobile'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vue Mobile"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        {/* Droite : Undo/Redo & Sauvegarde */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 pr-2 border-r border-border hidden md:flex">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              title="Annuler (⌘Z)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
              title="Rétablir (⌘⇧Z)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {publication.domain && (
            <a
              href={`https://${publication.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden lg:flex items-center gap-1.5 text-xs font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Voir en direct</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-sm ${
              hasUnsavedChanges
                ? 'hover:opacity-95 active:scale-95 cursor-pointer animate-pulse'
                : 'opacity-70 cursor-not-allowed'
            }`}
            style={{ backgroundColor: config.tokens.accentColor }}
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : hasUnsavedChanges ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>
              {isSaving ? 'Enregistrement...' : hasUnsavedChanges ? 'Enregistrer' : 'À jour'}
            </span>
          </button>
        </div>
      </header>

      {/* 4. Espace de Travail à 3 Panneaux */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Panneau Gauche : Arborescence des Calques & Blocs */}
        <aside className="w-72 border-r border-border bg-card flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Arborescence</span>
            </div>

            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="p-1 rounded-md text-xs font-semibold text-white flex items-center gap-1 shadow-xs hover:opacity-95"
              style={{ backgroundColor: config.tokens.accentColor }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter</span>
            </button>
          </div>

          {/* Liste des Blocs */}
          <div className="p-2 space-y-1 flex-1">
            {config.blocks.map((block, index) => {
              const isSelected = selectedBlockId === block.id;

              return (
                <div
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-muted text-foreground ring-1 ring-[var(--tenant-accent,hsl(var(--primary)))]'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  } ${!block.visible ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-4 text-[10px] text-muted-foreground font-mono">
                      {index + 1}
                    </span>
                    <span className="truncate">{block.label}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleBlockVisibility(block.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground rounded"
                    >
                      {block.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>

                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveBlock(block.id, 'up');
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      disabled={index === config.blocks.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveBlock(block.id, 'down');
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20 rounded"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sélecteur d'Archétype Rapide */}
          <div className="p-4 border-t border-border bg-muted/20">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Archétype Fondateur
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {['magazine', 'broadsheet', 'bento', 'minimal'].map((arch) => (
                <button
                  key={arch}
                  type="button"
                  onClick={() => handleApplyArchetype(arch)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                    config.archetype === arch
                      ? 'border-[var(--tenant-accent,hsl(var(--primary)))] bg-background text-foreground shadow-xs'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {arch}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Panneau Central : Canevas Vivant */}
        <main
          onClick={() => setSelectedBlockId(null)}
          className="flex-1 bg-muted/40 overflow-y-auto flex flex-col items-center p-6 md:p-12 relative"
        >
          {/* Badge de dimensions */}
          <div className="mb-4 px-3 py-1 rounded-full text-[10px] font-mono font-semibold bg-card border border-border text-muted-foreground shadow-xs">
            {viewport === 'mobile'
              ? 'Mobile 390px × 844px'
              : viewport === 'tablet'
                ? 'Tablette 768px × 1024px'
                : 'Bureau 100% Fluide'}
          </div>

          {/* Rendu du Canevas */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={`${viewportWidthClass} bg-background overflow-hidden transition-all duration-300`}
          >
            <TemplateRenderer
              config={config}
              publication={publication}
              articles={articles}
              mode="editable"
              selectedBlockId={selectedBlockId}
              onSelectBlock={(id) => setSelectedBlockId(id)}
              onMoveBlock={handleMoveBlock}
              onDeleteBlock={handleDeleteBlock}
            />
          </div>
        </main>

        {/* Panneau Droit : Inspecteur de Propriétés & Tokens Globaux */}
        <aside className="w-80 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              {selectedBlock ? `Réglages : ${selectedBlock.label}` : 'Tokens de Design Globaux'}
            </span>
            {selectedBlock && (
              <button
                type="button"
                onClick={() => setSelectedBlockId(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Fermer
              </button>
            )}
          </div>

          <div className="p-4 space-y-6">
            {selectedBlock ? (
              /* Inspecteur Contextuel du Bloc Sélectionné */
              <div className="space-y-4">
                <div className="p-3 bg-muted/40 rounded-xl border border-border/60">
                  <p className="text-xs font-semibold text-foreground">Type de section</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    {selectedBlock.type}
                  </p>
                </div>

                {/* Réglages spécifiques selon type */}
                {selectedBlock.type === 'hero' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-foreground">
                      Style de bannière
                    </label>
                    <select
                      value={
                        (selectedBlock.props as { style?: string }).style || 'cinematic-banner'
                      }
                      onChange={(e) => {
                        const blocks = config.blocks.map((b) =>
                          b.id === selectedBlock.id
                            ? { ...b, props: { ...b.props, style: e.target.value } }
                            : b
                        );
                        updateConfigWithHistory({ ...config, blocks });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-background"
                    >
                      <option value="cinematic-banner">Bannière Cinématique</option>
                      <option value="typographic-minimal">Typographique Minimal</option>
                    </select>
                  </div>
                )}

                {selectedBlock.type === 'lead-story' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-foreground">
                      Ratio de l'image
                    </label>
                    <select
                      value={
                        (selectedBlock.props as { aspectRatio?: string }).aspectRatio || '21:9'
                      }
                      onChange={(e) => {
                        const blocks = config.blocks.map((b) =>
                          b.id === selectedBlock.id
                            ? { ...b, props: { ...b.props, aspectRatio: e.target.value } }
                            : b
                        );
                        updateConfigWithHistory({ ...config, blocks });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-input bg-background"
                    >
                      <option value="21:9">Cinéma Grand Angle (21:9)</option>
                      <option value="16:9">Standard Paysage (16:9)</option>
                      <option value="4:3">Classique Photo (4:3)</option>
                    </select>
                  </div>
                )}

                {selectedBlock.type === 'bento-grid' && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-foreground">
                      Nombre d'articles
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            const blocks = config.blocks.map((b) =>
                              b.id === selectedBlock.id
                                ? { ...b, props: { ...b.props, maxArticles: count } }
                                : b
                            );
                            updateConfigWithHistory({ ...config, blocks });
                          }}
                          className={`py-1.5 text-xs font-semibold rounded-lg border ${
                            (selectedBlock.props as { maxArticles?: number }).maxArticles === count
                              ? 'border-[var(--tenant-accent,hsl(var(--primary)))] bg-muted text-foreground'
                              : 'border-border text-muted-foreground'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action de suppression */}
                <div className="pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(selectedBlock.id)}
                    className="w-full py-2 rounded-xl text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer cette section</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Tokens Globaux de Design */
              <div className="space-y-6">
                {/* Forme des Cartes */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">
                    Forme des Cartes (Tokens)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'rounded-none', label: 'Tranché (0px)' },
                      { id: 'rounded-xl', label: 'Élégant (12px)' },
                      { id: 'rounded-2xl', label: 'Généreux (16px)' },
                      { id: 'rounded-3xl', label: 'Ultra-doux (24px)' },
                    ].map((shape) => (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() =>
                          updateConfigWithHistory({
                            ...config,
                            tokens: { ...config.tokens, cardShape: shape.id as CardCornerShape },
                          })
                        }
                        className={`p-2 rounded-xl text-xs font-semibold border transition-all text-left ${
                          config.tokens.cardShape === shape.id
                            ? 'border-[var(--tenant-accent,hsl(var(--primary)))] bg-muted text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {shape.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Densité Spatiale */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">
                    Densité Spatiale
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'compact', label: 'Dense' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'spacious', label: 'Aérée' },
                    ].map((density) => (
                      <button
                        key={density.id}
                        type="button"
                        onClick={() =>
                          updateConfigWithHistory({
                            ...config,
                            tokens: { ...config.tokens, density: density.id as DensityMode },
                          })
                        }
                        className={`py-1.5 rounded-xl text-xs font-semibold border text-center transition-all ${
                          config.tokens.density === density.id
                            ? 'border-[var(--tenant-accent,hsl(var(--primary)))] bg-muted text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {density.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typographie */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">
                    Typographie Signature
                  </label>
                  <div className="space-y-1.5">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          updateConfigWithHistory({
                            ...config,
                            tokens: { ...config.tokens, fontFamily: font.id },
                          })
                        }
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          config.tokens.fontFamily === font.id
                            ? 'border-[var(--tenant-accent,hsl(var(--primary)))] bg-muted text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold">{font.name}</p>
                          <p className="text-[10px] text-muted-foreground">{font.category}</p>
                        </div>
                        {config.tokens.fontFamily === font.id && (
                          <Check className="w-3.5 h-3.5 text-[var(--tenant-accent,hsl(var(--primary)))]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Couleur d'Accentuation */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">
                    Couleur d'Accentuation
                  </label>
                  <div className="grid grid-cols-6 gap-2 mb-3">
                    {SWATCH_PALETTE.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        onClick={() =>
                          updateConfigWithHistory({
                            ...config,
                            tokens: { ...config.tokens, accentColor: swatch.hex },
                          })
                        }
                        className="w-8 h-8 rounded-full shadow-xs flex items-center justify-center transition-transform hover:scale-110"
                        style={{ backgroundColor: swatch.hex }}
                        title={swatch.name}
                      >
                        {config.tokens.accentColor === swatch.hex && (
                          <Check className="w-3.5 h-3.5 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    value={config.tokens.accentColor}
                    onChange={(e) =>
                      updateConfigWithHistory({
                        ...config,
                        tokens: { ...config.tokens, accentColor: e.target.value },
                      })
                    }
                    className="w-full h-8 rounded-lg cursor-pointer border border-input bg-background"
                  />
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 5. Modal Catalogue d'Ajout de Blocs */}
      <AnimatePresence>
        {isCatalogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">Ajouter une section</h3>
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez un bloc modulaire à insérer sur votre canevas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCatalogOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {BLOCK_CATALOG.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleAddBlock(item.type, item.label)}
                      className="w-full p-3.5 rounded-xl border border-border hover:border-[var(--tenant-accent,hsl(var(--primary)))] hover:bg-muted/50 flex items-start gap-3.5 text-left transition-all group"
                    >
                      <div
                        className="p-2.5 rounded-xl text-white shadow-xs group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: config.tokens.accentColor }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-foreground">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors self-center" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
