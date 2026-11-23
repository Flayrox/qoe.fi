// =====================================================================
// RightPanel.tsx — Inspecteur de Qoefi Stage
// =====================================================================

'use client';

import React from 'react';
import { Copy, Trash2, ArrowLeft, ArrowUp, ArrowDown, Plus, X } from 'lucide-react';
import type { LayoutConfig, TemplateBlock, TemplateNode } from '@qoe/ui/templates';
import { Select } from '@qoe/ui/select';
import { t } from '@lingui/core/macro';

interface RightPanelProps {
  layout: LayoutConfig;
  selectedBlockId: string | null;
  selectedOid: string | null;
  selectedNode: { node: TemplateNode; slotKey: string | null } | null;
  onUpdateBlockProps: (id: string, newProps: Record<string, unknown>) => void;
  onUpdateNode: (blockId: string, oid: string, patch: Partial<TemplateNode>) => void;
  onAddNode: (blockId: string, slotKey: string | null, kind: TemplateNode['kind']) => void;
  onRemoveNode: (blockId: string, oid: string) => void;
  onMoveNode: (blockId: string, oid: string, direction: 'up' | 'down') => void;
  onSelectNode: (oid: string | null, path: string | null, blockId: string | null) => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onSelectBlock: (id: string | null) => void;
  onToggleHiddenAt: (id: string, device: 'mobile' | 'tablet') => void;
}

const SLOT_KEYS = ['title', 'subtitle', 'actions', 'header', 'legal'] as const;
const NODE_KINDS: { kind: TemplateNode['kind']; label: string }[] = [
  { kind: 'text', label: t`Texte` },
  { kind: 'button', label: t`Bouton` },
  { kind: 'badge', label: t`Badge` },
  { kind: 'image', label: t`Image` },
];

export function RightPanel({
  layout,
  selectedBlockId,
  selectedOid,
  selectedNode,
  onUpdateBlockProps,
  onUpdateNode,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  onSelectNode,
  onDuplicateBlock,
  onDeleteBlock,
  onSelectBlock,
  onToggleHiddenAt,
}: RightPanelProps) {
  const selectedBlock: TemplateBlock | undefined = layout.blocks.find(
    (b: TemplateBlock) => b.id === selectedBlockId
  );

  // ── Cas 1 : Aucun bloc sélectionné (Inspecteur Global) ──
  if (!selectedBlock) {
    return (
      <aside className="w-72 flex flex-col bg-background/90 backdrop-blur-md border border-border/60 rounded-xl shadow-sm p-4 select-none text-xs space-y-4">
        <div className="font-medium text-foreground">{t`Inspecteur`}</div>

        <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground">
          <p className="text-[11px]">{t`Sélectionnez un bloc pour voir ses réglages.`}</p>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
            {t`Résumé de la Page`}
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>{t`Sections actives :`}</span>
            <span className="font-mono text-foreground">
              {layout.blocks.filter((b: TemplateBlock) => b.visible).length}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>{t`Archétype actif :`}</span>
            <span className="font-medium text-foreground capitalize">{layout.archetype}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-muted-foreground">
            <span>{t`Silhouette :`}</span>
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
    <aside className="w-72 flex flex-col bg-background/90 backdrop-blur-md border border-border/60 rounded-xl shadow-sm overflow-hidden select-none text-xs">
      {/* ── En-tête de l'Inspecteur ── */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize">{selectedBlock.type}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
            {selectedBlock.id.slice(0, 6)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={t`Dupliquer`}
            onClick={() => onDuplicateBlock(selectedBlock.id)}
            className="p-1 hover:text-foreground text-muted-foreground rounded transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t`Supprimer`}
            onClick={() => {
              onDeleteBlock(selectedBlock.id);
              onSelectBlock(null);
            }}
            className="p-1 hover:text-destructive-text text-muted-foreground rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Corps des Propriétés Spécifiques ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* NŒUD SÉLECTIONNÉ */}
        {selectedNode && selectedBlock && selectedOid && (
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
            <button
              type="button"
              onClick={() => onSelectNode(null, null, selectedBlock.id)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>
                {selectedBlock.type} › {selectedNode.node.kind}
              </span>
            </button>
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Élément ·`} {selectedNode.node.kind}
              {selectedNode.slotKey ? ` · ${selectedNode.slotKey}` : ''}
            </div>
            {(selectedNode.node.kind === 'text' ||
              selectedNode.node.kind === 'button' ||
              selectedNode.node.kind === 'badge') && (
              <div className="space-y-1">
                <label className="text-muted-foreground text-[11px]">{t`Texte`}</label>
                <input
                  type="text"
                  value={
                    (selectedNode.node.overrides?.text as string) ??
                    selectedNode.node.textFallback ??
                    ''
                  }
                  onChange={(e) =>
                    onUpdateNode(selectedBlock.id, selectedOid, {
                      overrides: { ...(selectedNode.node.overrides ?? {}), text: e.target.value },
                    })
                  }
                  className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
                />
              </div>
            )}
            {selectedNode.node.kind === 'button' && (
              <div className="space-y-1">
                <label className="text-muted-foreground text-[11px]">{t`Lien`}</label>
                <input
                  type="text"
                  value={(selectedNode.node.overrides?.href as string) ?? ''}
                  placeholder="/contact"
                  onChange={(e) =>
                    onUpdateNode(selectedBlock.id, selectedOid, {
                      overrides: { ...(selectedNode.node.overrides ?? {}), href: e.target.value },
                    })
                  }
                  className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
                />
              </div>
            )}
            {selectedNode.node.kind === 'image' && (
              <div className="space-y-1">
                <label className="text-muted-foreground text-[11px]">{t`Source image`}</label>
                <input
                  type="text"
                  value={(selectedNode.node.overrides?.src as string) ?? ''}
                  placeholder="https://…"
                  onChange={(e) =>
                    onUpdateNode(selectedBlock.id, selectedOid, {
                      overrides: { ...(selectedNode.node.overrides ?? {}), src: e.target.value },
                    })
                  }
                  className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemoveNode(selectedBlock.id, selectedOid)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-destructive/40 py-1.5 text-[11px] text-destructive-text hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              <span>{t`Supprimer l'élément`}</span>
            </button>
          </div>
        )}

        {/* CONSTRUCTEUR D'ÉLÉMENTS */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
            {t`Ajouter un élément`}
          </div>
          {SLOT_KEYS.map((slotKey) => {
            const count =
              (selectedBlock.slots?.[slotKey]?.length ?? 0) +
              (slotKey === 'header' ? (selectedBlock.nodes?.length ?? 0) : 0);
            return (
              <div key={slotKey} className="rounded-lg border border-border/50 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium capitalize">{slotKey}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{count}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {NODE_KINDS.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      onClick={() => onAddNode(selectedBlock.id, slotKey, k.kind)}
                      className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      title={t`Ajouter : ${k.label}`}
                    >
                      <Plus className="h-3 w-3" />
                      <span>{k.label}</span>
                    </button>
                  ))}
                </div>
                {(selectedBlock.slots?.[slotKey] ?? []).map((n) => (
                  <div
                    key={n.oid}
                    className="mt-1 flex items-center justify-between rounded-md bg-muted/40 px-2 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectNode(n.oid, `slots/${slotKey}`, selectedBlock.id)}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {n.kind} · {n.oid.slice(0, 6)}
                    </button>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => onMoveNode(selectedBlock.id, n.oid, 'up')}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        title={t`Monter`}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveNode(selectedBlock.id, n.oid, 'down')}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        title={t`Descendre`}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveNode(selectedBlock.id, n.oid)}
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive-text"
                        title={t`Supprimer`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {/* RESPONSIVE — visible sur tous les blocs */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
            {t`Appareils`}
          </div>
          {(['mobile', 'tablet'] as const).map((device) => {
            const hidden = (selectedBlock.hiddenAt ?? []).includes(device);
            return (
              <div key={device} className="flex items-center justify-between py-1">
                <span className="text-muted-foreground text-[11px]">
                  {device === 'mobile' ? t`Masquer sur mobile` : t`Masquer sur tablette`}
                </span>
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={() => onToggleHiddenAt(selectedBlock.id, device)}
                  className="rounded border-border accent-primary cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        {/* HERO PROPS */}
        {selectedBlock.type === 'hero' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Disposition & Bannière`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Variante Visuelle`}</label>
              <Select
                label={t`Variante visuelle`}
                hideLabel
                size="xs"
                value={(props.style as string) || 'cinematic-banner'}
                onValueChange={(style) => handlePropChange('style', style)}
                options={[
                  { id: 'cinematic-banner', label: t`Bannière` },
                  { id: 'typographic-minimal', label: t`Typographique` },
                  { id: 'split-featured', label: 'Deux Colonnes (Split)' },
                  { id: 'floating-card', label: t`Carte` },
                ]}
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Hauteur de Section`}</label>
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
                    {h === 'compact' ? t`Compact` : h === 'tall' ? t`Grand` : t`Standard`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Alignement du Texte`}</label>
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
                    {al === 'left' ? t`Gauche` : t`Centré`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Alignement sur mobile`}</label>
              <div className="grid grid-cols-3 gap-1">
                {(['auto', 'left', 'center'] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    onClick={() =>
                      handlePropChange(
                        'alignMobile',
                        al === 'auto' ? undefined : (al as 'left' | 'center')
                      )
                    }
                    className={`py-1 rounded-md capitalize transition-all ${
                      ((props.alignMobile as string) || 'auto') === al
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {al === 'auto' ? t`Auto` : al === 'left' ? t`Gauche` : t`Centré`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Titre Personnalisé`}</label>
              <input
                type="text"
                value={(props.customTitle as string) || ''}
                placeholder={t`Laisser vide pour le nom par défaut`}
                onChange={(e) => handlePropChange('customTitle', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Chapeau`}</label>
              <textarea
                rows={2}
                value={(props.customTagline as string) || ''}
                placeholder={t`Laisser vide pour masquer`}
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
              {t`Configuration Bento`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Nombre de Colonnes`}</label>
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
                    {cols} {t`Colonnes`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Colonnes sur mobile`}</label>
              <div className="grid grid-cols-2 gap-1">
                {[1, 2].map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => handlePropChange('columnsMobile', cols)}
                    className={`py-1 rounded-md font-medium transition-all ${
                      ((props.columnsMobile as number) || 1) === cols
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cols}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">{t`Afficher les Catégories`}</span>
              <input
                type="checkbox"
                checked={props.showCategories !== false}
                onChange={(e) => handlePropChange('showCategories', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">
                {t`Rubrique (slug, vide = toutes)`}
              </label>
              <input
                type="text"
                value={(props.categoryFilter as string) || ''}
                placeholder={t`ex. essais`}
                onChange={(e) => handlePropChange('categoryFilter', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>
          </div>
        )}

        {/* CATEGORY SPOTLIGHT PROPS */}
        {selectedBlock.type === 'category-spotlight' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Encadré rubrique`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Slug de la rubrique`}</label>
              <input
                type="text"
                value={(props.categorySlug as string) || ''}
                placeholder={t`ex. essais`}
                onChange={(e) => handlePropChange('categorySlug', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">
                {t`Titre (vide = nom de la rubrique)`}
              </label>
              <input
                type="text"
                value={(props.title as string) || ''}
                placeholder={t`Titre`}
                onChange={(e) => handlePropChange('title', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Présentation`}</label>
              <div className="grid grid-cols-2 gap-1">
                {(['framed', 'plain'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handlePropChange('layout', l)}
                    className={`py-1 rounded-md transition-all ${
                      (props.layout || 'framed') === l
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {l === 'framed' ? t`Encadré` : t`Simple`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Articles (1-6)`}</label>
              <input
                type="number"
                min={1}
                max={6}
                value={(props.maxArticles as number) ?? 3}
                onChange={(e) =>
                  handlePropChange(
                    'maxArticles',
                    Math.max(1, Math.min(6, Number(e.target.value) || 3))
                  )
                }
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">{t`Temps de lecture`}</span>
              <input
                type="checkbox"
                checked={props.showReadingTime !== false}
                onChange={(e) => handlePropChange('showReadingTime', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ARTICLE STREAM PROPS */}
        {selectedBlock.type === 'article-stream' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Flux d'Articles`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Format de Présentation`}</label>
              <Select
                label={t`Format de présentation`}
                hideLabel
                size="xs"
                value={(props.displayMode as string) || 'grid-3'}
                onValueChange={(displayMode) => handlePropChange('displayMode', displayMode)}
                options={[
                  { id: 'list', label: t`Lignes Compactes` },
                  { id: 'grid-2', label: t`Grille 2 Colonnes` },
                  { id: 'grid-3', label: t`Grille 3 Colonnes` },
                ]}
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Colonnes mobile (grille)`}</label>
              <div className="grid grid-cols-2 gap-1">
                {[1, 2].map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => handlePropChange('columnsMobile', cols)}
                    className={`py-1 rounded-md font-medium transition-all ${
                      ((props.columnsMobile as number) || 1) === cols
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cols}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">{t`Filtre par Catégories`}</span>
              <input
                type="checkbox"
                checked={props.showCategories !== false}
                onChange={(e) => handlePropChange('showCategories', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">
                {t`Rubrique (slug, vide = toutes)`}
              </label>
              <input
                type="text"
                value={(props.categoryFilter as string) || ''}
                placeholder={t`ex. essais`}
                onChange={(e) => handlePropChange('categoryFilter', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>
          </div>
        )}

        {/* NEWSLETTER WALL PROPS */}
        {selectedBlock.type === 'newsletter-wall' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Mur d'Abonnement`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Titre d'Incitation`}</label>
              <input
                type="text"
                value={(props.title as string) || ''}
                placeholder={t`Titre`}
                onChange={(e) => handlePropChange('title', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Texte du Bouton`}</label>
              <input
                type="text"
                value={(props.buttonText as string) || ''}
                placeholder={t`Texte du bouton`}
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
              {t`Navigation`}
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground text-[11px]">{t`En-tête Collante (Sticky)`}</span>
              <input
                type="checkbox"
                checked={props.sticky !== false}
                onChange={(e) => handlePropChange('sticky', e.target.checked)}
                className="rounded border-border accent-primary cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* LEAD-STORY PROPS */}
        {selectedBlock.type === 'lead-story' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Article vedette`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Badge`}</label>
              <input
                type="text"
                value={(props.badgeText as string) || ''}
                placeholder={t`Laisser vide pour masquer`}
                onChange={(e) => handlePropChange('badgeText', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Ratio image`}</label>
              <div className="grid grid-cols-4 gap-1">
                {(['16:9', '21:9', '4:3', '1:1'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handlePropChange('aspectRatio', r)}
                    className={`py-1 rounded-md font-mono text-[11px] transition-all ${
                      (props.aspectRatio || '16:9') === r
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {(
              [
                ['showExcerpt', t`Extrait`],
                ['showReadTime', t`Temps de lecture`],
                ['showDate', t`Date`],
                ['highlightFirstArticle', t`Mettre en avant`],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-1">
                <span className="text-muted-foreground text-[11px]">{label}</span>
                <input
                  type="checkbox"
                  checked={props[key] !== false}
                  onChange={(e) => handlePropChange(key, e.target.checked)}
                  className="rounded border-border accent-primary cursor-pointer"
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">
                {t`Rubrique (slug, vide = toutes)`}
              </label>
              <input
                type="text"
                value={(props.categoryFilter as string) || ''}
                placeholder={t`ex. essais`}
                onChange={(e) => handlePropChange('categoryFilter', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>
          </div>
        )}

        {/* FOOTER PROPS */}
        {selectedBlock.type === 'footer' && (
          <div className="space-y-3">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {t`Pied de page`}
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Disposition`}</label>
              <div className="grid grid-cols-2 gap-1">
                {(['columns', 'minimal-row'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handlePropChange('layout', l)}
                    className={`py-1 rounded-md transition-all ${
                      (props.layout || 'columns') === l
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {l === 'columns' ? t`Colonnes` : t`Ligne`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-[11px]">{t`Mention copyright`}</label>
              <input
                type="text"
                value={(props.customCopyright as string) || ''}
                placeholder={t`Tous droits réservés.`}
                onChange={(e) => handlePropChange('customCopyright', e.target.value)}
                className="w-full bg-muted/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground text-xs"
              />
            </div>

            {(
              [
                ['showLegalLinks', t`Liens légaux`],
                ['showSocialLinks', t`Réseaux sociaux`],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-1">
                <span className="text-muted-foreground text-[11px]">{label}</span>
                <input
                  type="checkbox"
                  checked={props[key] !== false}
                  onChange={(e) => handlePropChange(key, e.target.checked)}
                  className="rounded border-border accent-primary cursor-pointer"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
