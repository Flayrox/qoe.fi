// =====================================================================
// 📑 LeftPanel.tsx — Panneau Latéral Flottant de Qoefi Stage (Adapté d'Onlook)
// =====================================================================

'use client';

import React from 'react';
import {
  Layers,
  PlusCircle,
  Palette,
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
} from 'lucide-react';
import type {
  LayoutConfig,
  BlockType,
  TemplateBlock,
  TemplateArchetypeId,
} from '@qoe/ui/templates';
import { ARCHETYPES_REGISTRY } from '@qoe/ui/templates';
import type { StageLeftTab } from '../types';

interface LeftPanelProps {
  layout: LayoutConfig;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onDeleteBlock: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAddBlock: (type: BlockType) => void;
  onSelectArchetype: (archetypeId: TemplateArchetypeId) => void;
  onUpdateTokens: (tokens: Partial<LayoutConfig['tokens']>) => void;
  activeTab: StageLeftTab;
  onTabChange: (tab: StageLeftTab) => void;
}

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

export function LeftPanel({
  layout,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onDeleteBlock,
  onToggleVisibility,
  onAddBlock,
  onSelectArchetype,
  onUpdateTokens,
  activeTab,
  onTabChange,
}: LeftPanelProps) {
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
    <aside className="w-64 flex flex-col bg-background/90 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden select-none text-xs">
      {/* ── Onglets de Navigation Supérieurs ── */}
      <div className="flex items-center border-b border-border/40 p-1 bg-muted/30">
        <button
          type="button"
          onClick={() => onTabChange('layers')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'layers'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Calques</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('blocks')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'blocks'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Blocs</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('theme')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'theme'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Style</span>
        </button>
      </div>

      {/* ── Contenu de l'Onglet ── */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* TAB 1 : CALQUES (LAYERS TREE) */}
        {activeTab === 'layers' && (
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Structure de la Page ({layout.blocks.length})
            </div>
            {layout.blocks.map((block: TemplateBlock, index: number) => {
              const isSelected = selectedBlockId === block.id;
              const isFrame = block.type === 'navbar' || block.type === 'footer';

              return (
                <div
                  key={block.id}
                  onClick={() => onSelectBlock(block.id)}
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

                  {/* Boutons d'actions rapides au survol */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title={block.visible ? 'Masquer' : 'Afficher'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(block.id);
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
                        onMoveBlock(block.id, 'up');
                      }}
                      className="p-1 hover:text-foreground disabled:opacity-20 rounded"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === layout.blocks.length - 1}
                      title="Descendre"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveBlock(block.id, 'down');
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
                        onDeleteBlock(block.id);
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

        {/* TAB 2 : CATALOGUE DE BLOCS */}
        {activeTab === 'blocks' && (
          <div className="space-y-2">
            <div className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Ajouter une Section
            </div>
            {BLOCK_CATALOG.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.type}
                  onClick={() => onAddBlock(cat.type)}
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

        {/* TAB 3 : THÈME & STYLES GLOBAUX */}
        {activeTab === 'theme' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="px-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                Archétypes de Design
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.keys(ARCHETYPES_REGISTRY).map((key) => {
                  const isCurrent = layout.archetype === key;
                  const meta = ARCHETYPE_META[key] || { name: key, description: '' };
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelectArchetype(key as TemplateArchetypeId)}
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
                      <p className="text-[10px] text-muted-foreground mt-0.5">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tokens : Arrondi des cartes */}
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                Silhouette des Cartes
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(['rounded-none', 'rounded-xl', 'rounded-3xl'] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => onUpdateTokens({ cardShape: shape })}
                    className={`py-1.5 px-2 rounded-lg font-medium text-center capitalize transition-all ${
                      layout.tokens.cardShape === shape
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {shape === 'rounded-none' ? 'Vif' : shape === 'rounded-xl' ? 'Doux' : 'Galet'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tokens : Densité */}
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                Densité & Espacements
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(['compact', 'standard', 'spacious'] as const).map((dens) => (
                  <button
                    key={dens}
                    type="button"
                    onClick={() => onUpdateTokens({ density: dens })}
                    className={`py-1.5 px-1 rounded-lg font-medium text-center text-[10px] capitalize transition-all ${
                      layout.tokens.density === dens
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {dens === 'compact' ? 'Compact' : dens === 'standard' ? 'Idéal' : 'Aéré'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tokens : Élévation de Surface */}
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
                Surface & Matière
              </span>
              <div className="grid grid-cols-3 gap-1">
                {(['flat', 'bordered', 'glassmorphic'] as const).map((surf) => (
                  <button
                    key={surf}
                    type="button"
                    onClick={() => onUpdateTokens({ surface: surf })}
                    className={`py-1.5 px-1 rounded-lg font-medium text-center text-[10px] capitalize transition-all ${
                      layout.tokens.surface === surf
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
      </div>
    </aside>
  );
}
