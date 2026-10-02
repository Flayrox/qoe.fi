// =====================================================================
// 📑 LeftPanelFull.tsx — Rail & Tiroir Latéral à 2 Niveaux (Adapté d'Onlook)
// =====================================================================

'use client';

import React, { useState } from 'react';
import {
  Layers,
  PlusCircle,
  Palette,
  FileText,
  Eye,
  EyeOff,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Newspaper,
  Flame,
  Mail,
  PanelBottom,
  Check,
  HelpCircle,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';
import { ARCHETYPES_REGISTRY, type BlockType, type TemplateBlock } from '@qoe/ui/templates';

const BLOCK_CATALOG: {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: 'hero',
    label: 'Bannière & Manifeste',
    description: 'Grand titre percutant, typographie noble et appel à action.',
    icon: Flame,
  },
  {
    type: 'lead-story',
    label: 'Article Vedette & En Bref',
    description: 'Récit principal grand format accompagné de brèves.',
    icon: Newspaper,
  },
  {
    type: 'bento-grid',
    label: 'Grille Bento Dynamique',
    description: 'Disposition asymétrique pour formats hybrides et curation.',
    icon: LayoutGrid,
  },
  {
    type: 'article-stream',
    label: "Flux d'Articles",
    description: 'Liste chronologique avec filtres thématiques et lecture estimée.',
    icon: Newspaper,
  },
  {
    type: 'newsletter-wall',
    label: "Mur d'Abonnement",
    description: 'Section de conversion avec proposition de valeur et réassurance.',
    icon: Mail,
  },
  {
    type: 'footer',
    label: 'Pied de Page',
    description: 'Mentions légales, liens de navigation et réseaux.',
    icon: PanelBottom,
  },
];

const ARCHETYPE_META: Record<string, { name: string; description: string }> = {
  magazine: {
    name: 'Éditorial Magazine',
    description: 'Grand récit vedette, typographie littéraire noble et colonnes.',
  },
  broadsheet: {
    name: 'Broadsheet Moderne',
    description: 'Grille d’actualité dense inspirée de la presse de référence.',
  },
  bento: {
    name: 'Bento Technologique',
    description: 'Cartes modulaires asymétriques pour créateurs de contenus.',
  },
  minimal: {
    name: 'Carnet Minimaliste',
    description: 'Épure radicale, focus absolu sur la typographie et la lecture.',
  },
};

export function LeftPanelFull() {
  const engine = useStageEngine();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);

  if (engine.editorMode === StageEditorMode.PREVIEW) {
    return null;
  }

  const tabs = [
    { id: 'layers' as const, label: 'Calques', icon: Layers },
    { id: 'blocks' as const, label: 'Blocs', icon: PlusCircle },
    { id: 'brand' as const, label: 'Style', icon: Palette },
    { id: 'pages' as const, label: 'Pages', icon: FileText },
  ];

  const handleTabClick = (tabId: 'layers' | 'brand' | 'pages' | 'blocks') => {
    if (engine.leftPanelTab === tabId && engine.leftPanelLocked) {
      engine.setLeftPanelTab(null);
      engine.setLeftPanelLocked(false);
    } else {
      engine.setLeftPanelTab(tabId);
      engine.setLeftPanelLocked(true);
    }
  };

  const getBlockName = (block: TemplateBlock) => {
    switch (block.type) {
      case 'navbar':
        return 'En-tête & Navigation';
      case 'hero':
        return 'Bannière & Manifeste';
      case 'lead-story':
        return 'Article Vedette';
      case 'bento-grid':
        return 'Grille Bento';
      case 'article-stream':
        return "Flux d'Articles";
      case 'newsletter-wall':
        return "Mur d'Abonnement";
      case 'footer':
        return 'Pied de Page';
      default:
        return block.type;
    }
  };

  return (
    <div className="absolute top-4 left-4 z-40 flex items-stretch gap-2 select-none text-xs">
      {/* ── 1. Rail Vertical Fin Épuré (w-16) ── */}
      <div className="w-16 flex flex-col items-center py-2 gap-2 bg-background/90 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = engine.leftPanelTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}

        {/* Espace bas : Zoom & Aide */}
        <div className="mt-auto flex flex-col items-center gap-1.5 pt-2 border-t border-border/40">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsZoomMenuOpen((p) => !p)}
              title="Contrôles de zoom"
              className="w-10 h-8 rounded-lg flex items-center justify-center text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              {Math.round(engine.scale * 100)}%
            </button>

            {isZoomMenuOpen && (
              <div className="absolute left-12 bottom-0 w-36 bg-background/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl p-1.5 space-y-1 z-50">
                <button
                  type="button"
                  onClick={() => {
                    engine.zoomIn();
                    setIsZoomMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center justify-between"
                >
                  <span>Zoom avant</span>
                  <span className="font-mono text-muted-foreground">⌘+</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.zoomOut();
                    setIsZoomMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center justify-between"
                >
                  <span>Zoom arrière</span>
                  <span className="font-mono text-muted-foreground">⌘-</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.resetZoom();
                    setIsZoomMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center justify-between"
                >
                  <span>Recentrer</span>
                  <span className="font-mono text-muted-foreground">⇧0</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engine.setScale(1);
                    setIsZoomMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted flex items-center justify-between"
                >
                  <span>100%</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            title="Raccourcis & Aide"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 2. Tiroir Dépliable Étendu (w-72) ── */}
      <AnimatePresence>
        {engine.leftPanelTab && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className="w-72 flex flex-col bg-background/95 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header du panneau */}
            <div className="p-3 border-b border-border/40 flex items-center justify-between bg-muted/30">
              <span className="font-semibold text-foreground capitalize">
                {engine.leftPanelTab === 'layers'
                  ? 'Arborescence des Calques'
                  : engine.leftPanelTab === 'blocks'
                    ? 'Bibliothèque de Blocs'
                    : engine.leftPanelTab === 'brand'
                      ? 'Archétypes & Tokens'
                      : 'Pages & Navigation'}
              </span>
              <button
                type="button"
                onClick={() => engine.setLeftPanelTab(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Corps du panneau */}
            <div className="flex-1 overflow-y-auto p-2">
              {/* TAB 1 : CALQUES */}
              {engine.leftPanelTab === 'layers' && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                    Sections ({engine.layout.blocks.length})
                  </div>
                  {engine.layout.blocks.map((block: TemplateBlock, index: number) => {
                    const isSelected = engine.selectedBlockId === block.id;
                    const isFrame = block.type === 'navbar' || block.type === 'footer';

                    return (
                      <div
                        key={block.id}
                        onClick={() => engine.selectBlock(block.id)}
                        className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 text-foreground font-medium ring-1 ring-primary/40'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        } ${!block.visible ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[11px] font-mono text-primary/70">
                            {isFrame ? '#' : '◇'}
                          </span>
                          <span className="truncate">{getBlockName(block)}</span>
                        </div>

                        {/* Actions rapides au survol */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title={block.visible ? 'Masquer' : 'Afficher'}
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.toggleVisibility(block.id);
                            }}
                            className="p-1 hover:text-foreground rounded"
                          >
                            {block.visible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-destructive" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={index === 0}
                            title="Monter"
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.moveBlock(block.id, 'up');
                            }}
                            className="p-1 hover:text-foreground disabled:opacity-20 rounded"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === engine.layout.blocks.length - 1}
                            title="Descendre"
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.moveBlock(block.id, 'down');
                            }}
                            className="p-1 hover:text-foreground disabled:opacity-20 rounded"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title="Supprimer"
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.deleteBlock(block.id);
                            }}
                            className="p-1 hover:text-destructive rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 2 : BLOCS */}
              {engine.leftPanelTab === 'blocks' && (
                <div className="space-y-2">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                    Ajouter une Section
                  </div>
                  {BLOCK_CATALOG.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div
                        key={cat.type}
                        onClick={() => {
                          const newId = `block_${cat.type}_${Date.now()}`;
                          const newBlock: TemplateBlock = {
                            id: newId,
                            type: cat.type,
                            label: cat.label,
                            visible: true,
                            locked: false,
                            props: {},
                          };
                          const footerIdx = engine.layout.blocks.findIndex(
                            (b) => b.type === 'footer'
                          );
                          const nextBlocks = [...engine.layout.blocks];
                          if (footerIdx !== -1) {
                            nextBlocks.splice(footerIdx, 0, newBlock);
                          } else {
                            nextBlocks.push(newBlock);
                          }
                          engine.layout.blocks = nextBlocks;
                          engine.selectBlock(newId);
                          engine.setLeftPanelTab('layers');
                        }}
                        className="p-2.5 rounded-xl border border-border/40 hover:border-primary/50 bg-card hover:bg-muted/40 cursor-pointer transition-all space-y-1 group"
                      >
                        <div className="flex items-center gap-2 font-medium text-foreground group-hover:text-primary transition-colors">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          <span>{cat.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {cat.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 3 : STYLE & ARCHÉTYPES */}
              {engine.leftPanelTab === 'brand' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="px-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                      Archétypes de Design
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {Object.keys(ARCHETYPES_REGISTRY).map((key) => {
                        const isCurrent = engine.layout.archetype === key;
                        const meta = ARCHETYPE_META[key] || { name: key, description: '' };
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const target = ARCHETYPES_REGISTRY[key];
                              if (target) {
                                engine.layout.archetype = target.archetype;
                                engine.layout.tokens = { ...target.tokens };
                                engine.layout.blocks = target.blocks.map((b) => ({
                                  ...b,
                                  id: `${b.id}_${Date.now()}`,
                                }));
                                engine.selectBlock(null);
                              }
                            }}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                              isCurrent
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border/40 hover:border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-foreground">{meta.name}</span>
                              {isCurrent && <Check className="w-3.5 h-3.5 text-primary" />}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {meta.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Silhouette */}
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                      Silhouette des Cartes
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['rounded-none', 'rounded-xl', 'rounded-3xl'] as const).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => engine.updateTokens({ cardShape: shape })}
                          className={`py-1.5 px-2 rounded-lg font-medium text-center capitalize transition-all ${
                            engine.layout.tokens.cardShape === shape
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {shape === 'rounded-none'
                            ? 'Vif'
                            : shape === 'rounded-xl'
                              ? 'Doux'
                              : 'Galet'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Densité */}
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                      Densité & Espacements
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['compact', 'standard', 'spacious'] as const).map((dens) => (
                        <button
                          key={dens}
                          type="button"
                          onClick={() => engine.updateTokens({ density: dens })}
                          className={`py-1.5 px-1 rounded-lg font-medium text-center text-[10px] capitalize transition-all ${
                            engine.layout.tokens.density === dens
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {dens === 'compact' ? 'Compact' : dens === 'standard' ? 'Idéal' : 'Aéré'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Surface */}
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                      Surface & Matière
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(['flat', 'bordered', 'glassmorphic'] as const).map((surf) => (
                        <button
                          key={surf}
                          type="button"
                          onClick={() => engine.updateTokens({ surface: surf })}
                          className={`py-1.5 px-1 rounded-lg font-medium text-center text-[10px] capitalize transition-all ${
                            engine.layout.tokens.surface === surf
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {surf === 'flat' ? 'Plat' : surf === 'bordered' ? 'Bordé' : 'Verre'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4 : PAGES & NAVIGATION */}
              {engine.leftPanelTab === 'pages' && (
                <div className="space-y-2">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                    Navigation & Liens
                  </div>
                  <div className="p-3 bg-muted/40 rounded-xl space-y-2 text-muted-foreground">
                    <p className="text-[11px] leading-relaxed">
                      La navigation s&apos;adapte automatiquement aux rubriques et pages de votre
                      média.
                    </p>
                    <div className="space-y-1">
                      {(engine.publication.navigation || []).map((nav) => (
                        <div
                          key={nav.id}
                          className="flex items-center gap-2 py-1 text-foreground font-medium"
                        >
                          <span className="text-primary font-mono text-[10px]">#</span>
                          <span>{nav.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal d'Aide & Raccourcis Clavier ── */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="w-[360px] bg-background border border-border rounded-2xl shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <span className="font-bold text-sm text-foreground">Raccourcis Clavier</span>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Sélection</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">V</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Outil Main / Pan</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">H</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Déplacement libre</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">
                  Espace + Glisser
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Zoom</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">
                  ⌘ + Molette
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Recentrer</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">⇧ + 0</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Dupliquer le bloc</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">⌘ + D</kbd>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Supprimer le bloc</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">⌫ / Suppr</kbd>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">Annuler / Rétablir</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold">⌘Z / ⌘⇧Z</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
