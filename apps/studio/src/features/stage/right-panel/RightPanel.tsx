// =====================================================================
// 🔍 RightPanel.tsx — Inspecteur Chirurgical de Qoefi Stage (Adapté d'Onlook)
// =====================================================================

'use client';

import React from 'react';
import { Sliders, Copy, Trash2, Info } from 'lucide-react';
import type { LayoutConfig, TemplateBlock } from '@qoe/ui/templates';

interface RightPanelProps {
  layout: LayoutConfig;
  selectedBlockId: string | null;
  onUpdateBlockProps: (id: string, newProps: Record<string, unknown>) => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onSelectBlock: (id: string | null) => void;
}

export function RightPanel({
  layout,
  selectedBlockId,
  onUpdateBlockProps,
  onDuplicateBlock,
  onDeleteBlock,
  onSelectBlock,
}: RightPanelProps) {
  const selectedBlock: TemplateBlock | undefined = layout.blocks.find(
    (b: TemplateBlock) => b.id === selectedBlockId
  );

  // ── Cas 1 : Aucun bloc sélectionné (Inspecteur Global) ──
  if (!selectedBlock) {
    return (
      <aside className="w-72 flex flex-col bg-background/90 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl p-4 select-none text-xs space-y-4">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Sliders className="w-4 h-4 text-primary" />
          <span>Inspecteur Global</span>
        </div>

        <div className="p-3 rounded-xl bg-muted/40 border border-border/40 space-y-2 text-muted-foreground leading-relaxed">
          <div className="flex items-center gap-1.5 text-foreground font-medium">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span>Sélection d&apos;élément</span>
          </div>
          <p className="text-[11px]">
            Cliquez sur n&apos;importe quelle section sur le plan de travail ou dans
            l&apos;arborescence des calques à gauche pour ajuster sa typographie, ses espacements et
            son contenu.
          </p>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
            Résumé de la Page
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>Sections actives :</span>
            <span className="font-mono text-foreground">
              {layout.blocks.filter((b: TemplateBlock) => b.visible).length}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>Archétype actif :</span>
            <span className="font-medium text-foreground capitalize">{layout.archetype}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>Silhouette :</span>
            <span className="font-medium text-foreground capitalize">
              {layout.tokens.cardShape}
            </span>
          </div>
        </div>
      </aside>
    );
  }

  // ── Cas 2 : Bloc sélectionné ──
  type PropPrimitive = string | number | boolean | null | undefined;
  const props = (selectedBlock.props || {}) as Record<string, PropPrimitive>;

  const handlePropChange = (key: string, value: unknown) => {
    onUpdateBlockProps(selectedBlock.id, { [key]: value });
  };

  return (
    <aside className="w-72 flex flex-col bg-background/90 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden select-none text-xs">
      {/* ── En-tête de l'Inspecteur ── */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-primary font-mono text-xs">◇</span>
          <span className="font-semibold text-foreground capitalize">{selectedBlock.type}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
            {selectedBlock.id.slice(0, 6)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Dupliquer"
            onClick={() => onDuplicateBlock(selectedBlock.id)}
            className="p-1 hover:text-foreground text-muted-foreground rounded transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Supprimer"
            onClick={() => {
              onDeleteBlock(selectedBlock.id);
              onSelectBlock(null);
            }}
            className="p-1 hover:text-destructive text-muted-foreground rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Corps des Propriétés Spécifiques ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* HERO PROPS */}
        {selectedBlock.type === 'hero' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Disposition & Bannière
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Variante Visuelle</label>
              <select
                value={(props.style as string) || 'cinematic-banner'}
                onChange={(e) => handlePropChange('style', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              >
                <option value="cinematic-banner">Bannière Cinématique</option>
                <option value="typographic-minimal">Typographique Épurée</option>
                <option value="split-featured">Deux Colonnes (Split)</option>
                <option value="floating-card">Carte Flottante</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Hauteur de Section</label>
              <div className="grid grid-cols-3 gap-1">
                {(['compact', 'medium', 'tall'] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handlePropChange('height', h)}
                    className={`py-1 rounded-md capitalize transition-all ${
                      (props.height || 'medium') === h
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {h === 'compact' ? 'Compact' : h === 'tall' ? 'Grand' : 'Idéal'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Alignement du Texte</label>
              <div className="grid grid-cols-2 gap-1">
                {(['left', 'center'] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    onClick={() => handlePropChange('alignment', al)}
                    className={`py-1 rounded-md capitalize transition-all ${
                      (props.alignment || 'center') === al
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {al === 'left' ? 'Gauche' : 'Centré'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Titre Personnalisé</label>
              <input
                type="text"
                value={(props.customTitle as string) || ''}
                placeholder="Laisser vide pour le nom par défaut"
                onChange={(e) => handlePropChange('customTitle', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Slogan / Manifeste</label>
              <textarea
                rows={2}
                value={(props.customTagline as string) || ''}
                placeholder="Texte introductif percutant"
                onChange={(e) => handlePropChange('customTagline', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs resize-none"
              />
            </div>
          </div>
        )}

        {/* BENTO GRID PROPS */}
        {selectedBlock.type === 'bento-grid' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Configuration Bento
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Nombre de Colonnes</label>
              <div className="grid grid-cols-2 gap-1">
                {[2, 3].map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => handlePropChange('columns', cols)}
                    className={`py-1 rounded-md font-medium transition-all ${
                      (props.columns || 3) === cols
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cols} Colonnes
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">Afficher les Catégories</span>
              <input
                type="checkbox"
                checked={props.showCategories !== false}
                onChange={(e) => handlePropChange('showCategories', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ARTICLE STREAM PROPS */}
        {selectedBlock.type === 'article-stream' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Flux d&apos;Articles
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Format de Présentation</label>
              <select
                value={(props.displayMode as string) || 'grid-3'}
                onChange={(e) => handlePropChange('displayMode', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              >
                <option value="list">Lignes Compactes</option>
                <option value="grid-2">Grille 2 Colonnes</option>
                <option value="grid-3">Grille 3 Colonnes</option>
              </select>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">Filtre par Catégories</span>
              <input
                type="checkbox"
                checked={props.showCategories !== false}
                onChange={(e) => handlePropChange('showCategories', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* NEWSLETTER WALL PROPS */}
        {selectedBlock.type === 'newsletter-wall' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Mur d&apos;Abonnement
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Titre d&apos;Incitation</label>
              <input
                type="text"
                value={(props.title as string) || ''}
                placeholder="Rejoignez notre communauté"
                onChange={(e) => handlePropChange('title', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">Texte du Bouton</label>
              <input
                type="text"
                value={(props.buttonText as string) || ''}
                placeholder="S'abonner gratuitement"
                onChange={(e) => handlePropChange('buttonText', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>
          </div>
        )}

        {/* NAVBAR PROPS */}
        {selectedBlock.type === 'navbar' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              Navigation
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">En-tête Collante (Sticky)</span>
              <input
                type="checkbox"
                checked={props.sticky !== false}
                onChange={(e) => handlePropChange('sticky', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
