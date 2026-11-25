// =====================================================================
// TopBar.tsx — Barre supérieure de Qoefi Stage
// =====================================================================

'use client';

import React from 'react';
import Link from 'next/link';
import {
  Undo2,
  Redo2,
  ExternalLink,
  Eye,
  Edit3,
  ZoomIn,
  ZoomOut,
  Save,
  Loader2,
  Menu,
} from 'lucide-react';
import type { StageMode } from '../types';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';

interface TopBarProps {
  publisherName: string;
  domain: string;
  mode: StageMode;
  onModeChange: (mode: StageMode) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onPublish: () => void;
  isPublishing: boolean;
  saveError: string | null;
  unpublished: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({
  publisherName,
  domain,
  mode,
  onModeChange,
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  isSaving,
  hasUnsavedChanges,
  onPublish,
  isPublishing,
  unpublished,
  saveError,
  onToggleSidebar,
}: TopBarProps) {
  const percentage = Math.round(scale * 100);
  const publishState = hasUnsavedChanges ? 'dirty' : unpublished ? 'unpublished' : 'published';

  return (
    <header className="h-10 w-full px-3 flex items-center justify-between bg-background/85 backdrop-blur-xl border-b border-border/40 select-none z-50 text-xs">
      {/* ── Gauche : Menu Studio, Breadcrumb & Sélecteur Device ── */}
      <div className="flex items-center gap-3">
        {/* Déclencheur du tiroir Studio Navigation */}
        <Button
          variant="ghost"
          type="button"
          onClick={onToggleSidebar}
          title={t`Ouvrir la navigation Studio`}
          className="flex items-center justify-center w-7! h-7! rounded-lg text-foreground/80 hover:text-foreground hover:bg-muted/70 transition-colors [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! "
        >
          <Menu className="w-4! h-4!" />
        </Button>

        {/* Fil d'ariane */}
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <span className="text-foreground max-w-[140px] truncate">{publisherName}</span>
          <span className="opacity-40">/</span>
          <span className="text-foreground font-semibold">{t`Stage`}</span>
        </div>
      </div>

      {/* ── Centre : Mode Toggle (Design vs Aperçu) ── */}
      <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/40">
        <Button
          variant="ghost"
          type="button"
          onClick={() => onModeChange('design')}
          className={`hover:bg-transparent flex items-center gap-1.5 px-3 py-1 rounded-md font-medium! transition-all ${
            mode === 'design'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          } h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal `}
        >
          <Edit3 className="w-3! h-3!" />
          <span>{t`Design`}</span>
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => onModeChange('preview')}
          className={`hover:bg-transparent flex items-center gap-1.5 px-3 py-1 rounded-md font-medium! transition-all ${
            mode === 'preview'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          } h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal `}
        >
          <Eye className="w-3! h-3!" />
          <span>{t`Aperçu`}</span>
        </Button>
      </div>

      {/* ── Droite : Zoom, Undo/Redo, Live Link & Publisher ── */}
      <div className="flex items-center gap-2">
        {/* Contrôles de Zoom */}
        <div className="hidden md:flex items-center gap-1 bg-muted/50 px-1 py-0.5 rounded-lg border border-border/30">
          <Button
            variant="ghost"
            type="button"
            onClick={onZoomOut}
            title={t`Zoom arrière (⌘-)`}
            className="hover:bg-transparent p-1 text-muted-foreground hover:text-foreground rounded transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
          >
            <ZoomOut className="w-3! h-3!" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={onResetZoom}
            title={t`Recentrer le canvas (⇧0)`}
            className="hover:bg-transparent px-1.5 py-0.5 text-[11px]! font-mono font-medium! text-foreground/80 hover:text-foreground h-auto! leading-[inherit]! whitespace-normal! justify-normal inline-block "
          >
            {percentage}%
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onZoomIn}
            title={t`Zoom avant (⌘+)`}
            className="hover:bg-transparent p-1 text-muted-foreground hover:text-foreground rounded transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
          >
            <ZoomIn className="w-3! h-3!" />
          </Button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title={t`Annuler (⌘Z)`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
          >
            <Undo2 className="w-3.5! h-3.5!" />
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title={t`Rétablir (⌘⇧Z)`}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
          >
            <Redo2 className="w-3.5! h-3.5!" />
          </Button>
        </div>

        <div className="h-4 w-px bg-border/60 mx-1" />

        {/* Lien direct vers le site live */}
        <Link
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          title={t`Ouvrir le site public`}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors"
        >
          <span className="truncate max-w-[120px]">{domain}</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </Link>

        {/* Bouton d'enregistrement (brouillon) et publication */}
        {publishState === 'dirty' ? (
          <Button
            variant="solid"
            tone="brand"
            type="button"
            onClick={onSave}
            disabled={isSaving}
            title={t`Enregistrer le brouillon (le site public ne change pas)`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium! shadow-xs transition-all bg-primary text-primary-foreground hover:opacity-95 h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
          >
            {isSaving ? (
              <Loader2 className="w-3.5! h-3.5! animate-spin" />
            ) : (
              <Save className="w-3.5! h-3.5!" />
            )}
            <span>{t`Enregistrer`}</span>
          </Button>
        ) : publishState === 'unpublished' ? (
          <Button
            variant="solid"
            tone="brand"
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            title={t`Mettre le brouillon en ligne`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium! shadow-xs transition-all bg-primary text-primary-foreground hover:opacity-95 h-auto! [font-size:inherit]! leading-[inherit]! whitespace-normal! justify-normal "
          >
            {isPublishing ? (
              <Loader2 className="w-3.5! h-3.5! animate-spin" />
            ) : (
              <Save className="w-3.5! h-3.5!" />
            )}
            <span>{t`Brouillon · Publier`}</span>
          </Button>
        ) : (
          <span
            title={t`Le site public reflète l'atelier`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium bg-muted text-muted-foreground"
          >
            <span>{t`Publié`}</span>
          </span>
        )}
        {saveError && (
          <span className="truncate text-[11px] text-destructive-text" role="alert">
            {saveError}
          </span>
        )}
      </div>
    </header>
  );
}
